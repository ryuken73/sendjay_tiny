const config = require('./config')
const nodeConfig = require(config.app.nodeConfig)
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const fcmAccount = require(config.push.fcm_key_file)
const com = require('./common')
const fs = require('fs')
const cors = require('cors')
const socketio = require('socket.io')
const Redis = require('ioredis')
const redisAdapter = require('socket.io-redis')
const { Worker } = require('worker_threads')
const fcm = require('firebase-admin')

//config is env file inside project. nodeConfig is env file shared for inter projects.
//com is common module inside project. ws and wsmysql are common modules for inter projects.
//In fact this project is only one, so it is no need to separate common project from sendjay.
//config는 프로젝트내 공유하는 환경설정파일. nodeConfig는 프로젝트간 공유하는 환경설정파일.
//com은 프로젝트내 공통모듈. ws, wsmysql은 프로젝트간 공통모듈.
//사실, 이 프로젝트는 한개이므로 굳이 common 프로젝트를 sendjay로부터 분리해서 공유할 필요는 없음.

//https://socket.io/docs/v3/migrating-from-2-x-to-3-0, https://socket.io/docs/v3/server-api/index.html, https://socket.io/docs/v3/client-initialization
//https://socketio.github.io/socket.io-client-java/initialization.html, https://github.com/socketio/socket.io-redis

const DIR_SOCKET = './socket/', DIR_PUBSUB = './pubsub/', DIR_ROUTE = '/route'
const PING_TIMEOUT = 5000, PING_INTERVAL = 25000 //default

if (!fs.existsSync(config.app.logPath)) fs.mkdirSync(config.app.logPath)
if (!fs.existsSync(config.app.uploadPath)) fs.mkdirSync(config.app.uploadPath)

ws.util.addGlobal({ logPath: config.app.logPath, dirName: __dirname }, nodeConfig)

global.pool = wsmysql.createPool(config.mysql.schema)

const redisOpt = { host : nodeConfig.redis.host, port : nodeConfig.redis.port, password : nodeConfig.redis.pwd, db : config.redis.db }
global.store = new Redis(redisOpt)
global.pub = new Redis(redisOpt)
const sub = new Redis(redisOpt)
global.pub.on('error', err => console.error('ioredis pub error :', err.stack))
if (config.redis.flush == 'Y') global.store.flushdb(function(err, result) { console.log('redis db flushed :', result) }) //Only one server flushes db.
//As for now, Redis is being used only for socket connection in multi server environment so that it might be good chance to clear garbage when NodeJS rebooting.
//현재로선, Redis가 멀티서버에서의 소켓연결정보 관리에만 사용중이므로 NodeJS 재시작시 해당 redis데이터베이스내 데이터를 모두 지우는 것이 가비지정리 등에도 좋을 것임.

const app = ws.util.initExpressApp('public')
const wasServer = ws.util.createWas(app, config.http.method) //not https (because of aws elastic load balancer)
wasServer.listen(config.http.port, () => { console.log('wasServer listening on ' + config.http.port) })

const appSocket = ws.util.initExpressApp()
const socketServer = ws.util.createWas(appSocket, config.http.method) //not https (because of aws elastic load balancer)
socketServer.listen(config.sock.port, () => { console.log('socketServer (namespace : ' + config.sock.namespace + ') listening on ' + config.sock.port) })
const io = socketio(socketServer, { allowEIO3: false, autoConnect: true, pingTimeout: PING_TIMEOUT, pingInterval: PING_INTERVAL, cors: { origin: config.app.corsSocket, methods: ["GET", "POST"] }})
io.adapter(redisAdapter({ host: nodeConfig.redis.host, port: nodeConfig.redis.port, password : nodeConfig.redis.pwd }))
global.jay = io.of('/' + config.sock.namespace)

sub.psubscribe(com.cons.pattern, (err, count) => { console.log('redis psubscribe pattern : ' + com.cons.pattern) }) //ioredis (not socket.io-redis)
sub.on('pmessage', (pattern, channel, message) => { require(DIR_PUBSUB + 'pmessage')(pattern, channel, message) })
sub.on('error', err => { console.error('ioredis sub error:', err.stack) })

fcm.initializeApp({ credential : fcm.credential.cert(fcmAccount) })
global.fcm = fcm

//eg) server-side => global.jay.use((socket, next) => { const err = new Error("not authorized"); err.data = { content: "Please retry later" }; next(err); });
//eg) client-side => socket.on("connect_error", err => { console.log(err instanceof Error); // true console.log(err.message); // not authorized console.log(err.data); // { content: "Please retry later" } });
global.jay.on('connection', async (socket) => {
	const _logTitle = 'connect'	
	try {
		const queryParam = socket.handshake.query
		if (queryParam && queryParam.userid && queryParam.userkey && queryParam.winid && queryParam.userip) {
			socket.userid = queryParam.userid
			socket.userkey = queryParam.userkey
			socket.winid = queryParam.winid
			socket.userip = queryParam.userip
		} else {
			com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, 'userid or userkey or winid not set') 
			socket.disconnect()
			return
		}
		if (queryParam.token) {			
			if (!socket.usertoken) {
				const rst = await com.verifyToken(queryParam.userid, queryParam.token)
				if (rst.code != ws.cons.RESULT_OK) {
					com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, rst.msg)
					socket.disconnect()
					return
				}
				socket.usertoken = rst.token
			}
		} else {
			com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, 'token not exists') 
			socket.disconnect()
			return
		}
		await com.multiSetForUserkeySocket(socket)
		const pattern = com.cons.key_str_socket + socket.userkey + com.cons.easydeli
		//com.procWarn(null, socket, _logTitle, socket.userkey + ', ' + socket.id, pattern)
		const stream = store.scanStream({ match : pattern + '*', count : com.cons.scan_stream_cnt })
		stream.on('data', (resultKeys) => { //Search for userkey's another socketid which might be alive on (other) server(s), and kill them.
			for (let item of resultKeys) {
				const _sockid = item.split(com.cons.easydeli)[1]
				if (_sockid != socket.id) { //kill every specific userkey's previous socket (except current socket).
					//adapter.remoteDisconnect not used since a lot of work to do when making other socket disconnect.
					//adapter.remoteDisconnect 사용하지 않음 : 추가로 처리할 내용이 있어서 그대로 사용하기로 함
					com.pub('disconnect_prev_sock', { prevkey : item, socketid : socket.id, userkey : socket.userkey, userip : socket.userip }) //call pmessage()
				}
			}
		})
		com.broadcast(socket, com.cons.sock_ev_show_on, socket.userkey, 'all')
		socket.on(com.cons.sock_ev_disconnect, (reason) => require(DIR_SOCKET + com.cons.sock_ev_disconnect)(socket, reason))
		socket.on(com.cons.sock_ev_common, (param) => require(DIR_SOCKET + param.ev)(socket, param)) //Most of events use this procedure.
		socket.on('error', (err) => global.log.error('socket error', err.toString()))
	} catch (ex) {
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex)
		socket.disconnect()
	}
})

//eg) global.jay.adapter.on("create-room", (room) => { console.log(`room ${room} was created`) })
//eg) global.jay.adapter.on("delete-room?", (room) => { console.log(`room ${room} was deleted`) })
//eg) global.jay.adapter.on("join-room", (room, id) => { console.log(`socket ${id} has joined room ${room}`) })
//eg) global.jay.adapter.on("leave-room", (room, id) => {	console.log(`socket ${id} has left room ${room}`) })

const corsOptions = { //for Rest
	origin : function (origin, callback) {
		if (!origin || config.app.corsRestful.indexOf(origin) > -1) { //!origin = in case of same origin
			callback(null, true)
		} else {
			const _msg = 'Not allowed by CORS : ' + origin
			global.log.info(_msg)
			callback(new Error(_msg))
		}
	}
}

app.use(DIR_ROUTE + '/login', require('.' + DIR_ROUTE + '/login'))
app.use(DIR_ROUTE + '/admin', require('.' + DIR_ROUTE + '/admin')) //Web Only. verifyWithRestUserId
app.use(DIR_ROUTE + '/get_opengraph', require('.' + DIR_ROUTE + '/get_opengraph')) //No verifyWithRestUserId
app.use(DIR_ROUTE + '/qry_orgtree', require('.' + DIR_ROUTE + '/qry_orgtree')) //No verifyWithRestUserId (qry_orgtree in portal page before login)
app.use(DIR_ROUTE + '/proc_user', require('.' + DIR_ROUTE + '/proc_user')) //verifyWithRestUserId (except 'new' mode)
app.use(DIR_ROUTE + '/chk_redis', cors(corsOptions), require('.' + DIR_ROUTE + '/chk_redis')) //verifyWithRestUserId, cors
app.use(DIR_ROUTE + '/proc_env', require('.' + DIR_ROUTE + '/proc_env'))
app.use(DIR_ROUTE + '/proc_picture', require('.' + DIR_ROUTE + '/proc_picture'))
app.use(DIR_ROUTE + '/qry_userlist', require('.' + DIR_ROUTE + '/qry_userlist'))
app.use(DIR_ROUTE + '/qry_portal', require('.' + DIR_ROUTE + '/qry_portal'))
app.use(DIR_ROUTE + '/qry_msglist', require('.' + DIR_ROUTE + '/qry_msglist'))
app.use(DIR_ROUTE + '/qry_unread', require('.' + DIR_ROUTE + '/qry_unread'))
app.use(DIR_ROUTE + '/get_roominfo', require('.' + DIR_ROUTE + '/get_roominfo'))
app.use(DIR_ROUTE + '/proc_image', require('.' + DIR_ROUTE + '/proc_image'))
app.use(DIR_ROUTE + '/proc_file', require('.' + DIR_ROUTE + '/proc_file'))
app.use(DIR_ROUTE + '/get_msginfo', require('.' + DIR_ROUTE + '/get_msginfo'))

app.get('/*', require('.' + DIR_ROUTE + '/redirect')) //for no-cache

//////////////////////////////////////////////////////////////////////////////////////////////Worker
// if (config.redis.flush == 'Y') { //Only port80 server 
// 	const worker01 = new Worker('./thread/worker01.js') //worker.postMessage('hello')
// 	worker01.on('message', async (data) => { 
// 		try {
// 			if (data.ev == 'del_redis_socket') { //console.log(data.item+"==="+data.userkey)
// 				const sockInfo = com.getUserkeySocketid(data.item) //$$SD__3;/sendjay#sjkfhsaf8934kmhjsfd8 
// 				com.pub('disconnect_prev_sock', { prevkey : data.item, socketid : sockInfo.socketid, userkey : data.userkey }) //call pmessage()
// 			}
// 		} catch (ex) {
// 			global.log.error(data.ev + ': error: ', ex.stack)
// 		}
// 	})
// }   
const worker02 = new Worker('./thread/worker02.js') //port80 and 81 both of servers
worker02.on('message', async (data) => {
	try {
		if (data.ev = 'chk_sockets_rooms') {
			const sockets = await global.jay.adapter.sockets(new Set())
			const rooms = await global.jay.adapter.allRooms()			
			console.log('socket count :', sockets.size, '/ room count :', rooms.size, '/memory :', JSON.stringify(ws.util.osMem()))
		}
	} catch (ex) {
		global.log.error(data.ev + ': error: ', ex.stack)
	}
})
//////////////////////////////////////////////////////////////////////////////////////////////

ws.util.watchProcessError()
