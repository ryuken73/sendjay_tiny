const config = require('./config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)

module.exports = (function() {

	const PREFIX = '$$' //for redis

	let com = {
	
		cons : {
			title : 'sendjay',
			nocache : "nocache", //to remove cache for get method. same as client's
			deli : '##',
			subdeli : '$$',
			indeli : "','", //Use this for sql where in clause.
			easydeli : ';', //Use this for absolutely safe place.
			memdeli : ' / ',
			keydeli : '__', 
			w_key : 'W__', //Web userkey
			m_key : 'M__', //Mobile userkey
			prefix : PREFIX, //for redis
			pattern : PREFIX + '*', //redis pub/sub
			rq : 'RQ => ', //not that important
			rs : 'RS => ', //not that important
			max_member_for_org : 16, //temporary. same as client's
			max_diff_sec_worker : 3 * 2, //SEC in jay_worker.js * 2
			max_days_to_fetch : -365, //For sql where.
			max_check_same_members : 50, //Consider up to 50 and no more. max 1500 bytes for members field in z_roommem_tbl. userid(20) + alpha = 21 * 50 = 1050 bytes.
			max_people_to_display : 3, //Consider up to 10 and no more. max 800 bytes for roomnm field in z_roommst_tbl. usernm(50) + userid(20) + alpha = 80 * 10 = 800 bytes.
			max_hours_to_filesave : 1, //max_days_to_filesave : 1, //File's expiry
			max_nicknm_len : 100, //same as client's
			max_msg_len : 4000, //same as client's
			max_filesize : 10485760, //10MB
			max_filecount : 5, //per user
			max_size_to_sublink : 5242880, //5MB. same as client's
			group_ay : ['admin', 'ay'], //rolegroup for hushsbay in private only
			group_main : ['admin', 'main'], //rolegroup
			key_str_winid : PREFIX + 'W', //redis strings (userkey+deli+winid prefix added) - get winid for auto launch
			key_str_socket : PREFIX + 'S', //redis strings (userkey+deli+socketid prefix added) - get socketid
			key_set_userkey_socket : PREFIX + 'US', //redis set - get prefix+'S'+userkey+deli+socketid => currently in no use but stayed alive for future
			scan_stream_cnt : 100, //means scanning count at a time, not whole count to scan. https://www.gitmemory.com/issue/luin/ioredis/908/511472853. Without count param, Something unexpectable might be happend ?!.
            sock_ev_alert : 'alert',
			sock_ev_toast : 'toast',
			sock_ev_disconnect : "disconnect",
			sock_ev_common : 'common', //Belows are handled in this sock_ev_common event.
			sock_ev_chk_alive_simple : 'chk_alive_simple',
			sock_ev_show_off : 'show_off',
			sock_ev_show_on : 'show_on',
			sock_ev_create_room : 'create_room',
			sock_ev_open_room : 'open_room',
			sock_ev_qry_msglist : 'qry_msglist',
			sock_ev_send_msg : 'send_msg',
			sock_ev_read_msg : 'read_msg', 
			sock_ev_qry_msgcell : 'qry_msgcell', 
			sock_ev_revoke_msgcell : 'revoke_msgcell',
			sock_ev_delete_msg : 'delete_msg',
			sock_ev_invite_user : 'invite_user',
			sock_ev_rename_room : 'rename_room',
			sock_ev_set_env : 'set_env',
			sock_ev_chk_typing : 'chk_typing',
			sock_ev_cut_mobile : 'cut_mobile',
			cell_revoked : 'message cancelled',
			file_expired : 'expired', //Used in daemon and client too.
			sublink_ext_image : 'png,gif,jpg,jpeg,ico',
			sublink_ext_video : 'mp4', //File format which supports html5 streaming.
			sublink_result_img : '.png', //ffmpeg converts screenshot to png.
			invalid_push_token : 'invalid_token'
		},

		tbl : { //table for dev and ops (separated)
			filelog : config.mysql.schema + '.A_FILELOG_TBL',
			msgdtl : config.mysql.schema + '.A_MSGDTL_TBL',
			msgmst : config.mysql.schema + '.A_MSGMST_TBL',
			roomdtl : config.mysql.schema + '.A_ROOMDTL_TBL',
			roommem : config.mysql.schema + '.A_ROOMMEM_TBL',
			roommst : config.mysql.schema + '.A_ROOMMST_TBL',
			org : config.mysql.schema + '.Z_ORG_TBL',
			user : config.mysql.schema + '.Z_USER_TBL'	
		},
	
		procWarn : (_type, _socket, _logTitle, _ex, _roomid) => {
			try { //_type = alert, toast, null(just logging)
				const logTitle = _logTitle ? _logTitle : config.sock.namespace				
				const ip = _socket && _socket.userip ? '[' + _socket.userip + ']' : '' //not _socket.handshake.address (because of aws load balancer)
				const userkey = _socket && _socket.userkey ? '[' + _socket.userkey + ']' : ''
				const errMsg = (typeof _ex == 'string') ? '[' + _ex + ']' : '[' + _ex.message + ']'
				const errMsg1 = (typeof _ex == 'string') ? '[' + _ex + ']' : '[' + _ex.stack + ']'
				const roomid = _roomid ? _roomid : ''
				global.log.info(logTitle, ip, userkey, errMsg1, roomid) //This line should precede _socket (in the next line).
				if (_type && _socket) _socket.emit(_type, { code : '-1', msg : '[server::' + _logTitle + '] ' + errMsg, roomid : roomid })
			} catch (ex) { 
				global.log.error(_logTitle, 'procWarn : ' + ex.stack)
			}
		},

		makeToken : (userid, passkey) => {
			const obj = { userid : userid, passkey : passkey }
			const key = passkey + passkey + passkey + passkey + passkey + '!!' //32bytes
			const token = ws.token.makeJwt(obj, key)
			return token
		},

		verifyToken : async (userid, token) => {
			//Passkey is 1) saved when userid being registered 
			//2) changed when Reset_Authentication(report of the loss) button (in web messenger setting tab) pressed 
			//3) and used for validation when auto login as follows.
			//So if someone's jwt(token) is exposed to others, just let the user reset auth for their authentication protection without changing their password. 
			//Passkey는 1) 사용자등록시 저장되고 
			//2) 웹메신저 설정 탭에서 Reset_Authentication(분실신고) 버튼 누르면 값이 변경되어 
			//3) 자동로그인시 쿠키로 저장된 값과 비교해 다르면 자동로그인이 해제됨. 
			//토큰이 외부 노출시 Reset_Authentication 버튼 누르면 비번 변경없이 (다른 디바이스 포함해서) 자동로그인을 해제할 수 있음. 
			let conn
			try {
				conn = await wsmysql.getConnFromPool(global.pool)
				const qry = "SELECT PASSKEY FROM " + com.tbl.user + " WHERE USER_ID = ? "
				const data = await wsmysql.query(conn, qry, [userid])
				if (data.length == 0) throw new Error('Userid' + ws.cons.MSG_NOT_EXIST)
				if (data[0].PASSKEY == '') throw new Error('Passkey is blank.')
				if (conn) wsmysql.closeConn(conn)
				const key = data[0].PASSKEY + data[0].PASSKEY + data[0].PASSKEY + data[0].PASSKEY + data[0].PASSKEY + '!!' //32bytes
				const rst = await ws.token.verifyJwt(token, userid, key) //if key changes, error (invalid signature) occurs.
				if (rst.code != ws.cons.RESULT_OK) return rst //Actually next line is useless since passkey is compared already in ws.token.verifyJwt() above.
				if (rst.token.passkey != data[0].PASSKEY) return { code : ws.cons.WARN_PASSKEY_NOT_MATCHED, msg : 'Passkey not matched.' }
				return rst
			} catch (ex) {
				try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
				return { code : '-1', msg : ex.message }
			}
		},

		verifyWithSocketUserId : (idToCompare, socket_userid) => { //for socket only
			//In most cases, idToCompare should be same as socket_userid. If not, set idToCompare to null.
			//대부분의 경우는 idToCompare와 socket_userid는 일치해야 하는 경우가 많음. 그게 아니라면, idToCompare를 null로 두면 통과될 것임 
			if (!idToCompare || (idToCompare && idToCompare != socket_userid)) {
				return 'mismatch between UserID(' + idToCompare + ') and SocketUserID(' + socket_userid + ')'
			} else {
				return ''
			}
		},

		verifyWithRestUserId : async (req, res, idToCompare, _logTitle) => { //for rest only
			//In most cases, idToCompare should be same as req.cookies.userid. If not, set idToCompare to null.
			//대부분의 경우는 idToCompare와 userid쿠키는 일치해야 하는 경우가 많음. 그게 아니라면, idToCompare를 null로 두면 통과될 것임 
			let result = true
			try {
				const rs = await com.verifyToken(req.cookies.userid, req.cookies.token)
				if (rs.code != ws.cons.RESULT_OK) {
					ws.web.resError(res, rs.code, rs.msg, _logTitle)
					result = false
				} else {
					if (idToCompare && idToCompare != req.cookies.userid) {
						ws.web.resError(res, ws.cons.WARN_USE_ONLY_OWN_USERID, 'mismatch between UserID(' + idToCompare + ') and CookieUserID(' + req.cookies.userid + ')', _logTitle)
						result = false
					} else {
						req.token = rs.token
					}
				}
			} catch (ex) {
				ws.log.ex(req, ex, _logTitle)
				ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
				result = false
			} finally {
				return result
			}
		},

		chkAccessUserWithTarget : async (userid, uid, type, target) => { //for socket or rest
			let conn, ret = 'You have no access.'
			try { //console.log(userid, uid, type, target)
				conn = await wsmysql.getConnFromPool(global.pool)
				if (type == 'file' || type == '') { //'' means general type for msgid
					const data = await wsmysql.query(conn, "SELECT COUNT(*) CNT FROM " + com.tbl.msgdtl + " WHERE MSGID = ? AND RECEIVERID = ? ", [uid, userid])
					if (data[0].CNT > 0) {
						if (type == 'file') {
							const dataM = await wsmysql.query(conn, "SELECT BODY, TYPE FROM " + com.tbl.msgmst + " WHERE MSGID = ? ", [uid])
							if (dataM.length > 0) {
								const _file = dataM[0].BODY.split(com.cons.deli)[0] //console.log(_file, dataM[0].TYPE, target, "===")
								if (dataM[0].TYPE == 'flink' || target.includes(_file)) ret = "" //The filepath is in msgid
							} else {
								ret = 'No data for A_MSGMST_TBL'
							}
						} else {
							ret = ''
						}
					} else {
						const dataM = await wsmysql.query(conn, "SELECT COUNT(*) CNT FROM " + com.tbl.msgmst + " WHERE MSGID = ? ", [uid])
						if (dataM[0].CNT == 0) ret = ''
					}
				} else if (type == 'room') {
					const data = await wsmysql.query(conn, "SELECT COUNT(*) CNT FROM " + com.tbl.roomdtl + " WHERE ROOMID = ? AND USERID = ? ", [uid, userid])
					if (data[0].CNT > 0) ret = ''
				}
				if (conn) wsmysql.closeConn(conn)
				return ret
			} catch (ex) {
				try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
				return ex.message
			}
		},

		getRole : async (userid, conn) => {
			let ret = 'none'
			try {
				const data = await wsmysql.query(conn, "SELECT ROLE FROM " + com.tbl.user + " WHERE USER_ID = ? AND DEL_DATE = '' ", [userid])
				if (data.length > 0 && data[0].ROLE) ret = data[0].ROLE	
			} catch (ex) {
				console.log('getRole: ' + ex.message)
			} finally {
				return ret
			}
		},

		chkRole : (roleList, roleItem) => {
			let ret = false			
			if (typeof roleList != 'string') {
				console.log('chkRole server: roleList should be type of string : ' + typeof roleList)
			} else {
				if (typeof roleItem == 'string') {
					if ((',' + roleList + ',').includes(',' + roleItem + ',')) ret = true
				} else if (Array.isArray(roleItem)) {
					for (let i = 0; i < roleItem.length; i++) {
						if ((',' + roleList + ',').includes(',' + roleItem[i] + ',')) {
							ret = true
							break
						}
					}
				}
			}
			return ret
		},

		broadcast : (socket, ev, data, returnTo, returnToAnother) => {
			const _returnTo = returnTo ? returnTo : 'parent' //'all' used in most cases
			//global.jay.emit(com.cons.sock_ev_common, { ev : ev, data : data, returnTo : _returnTo, returnToAnother : returnToAnother }) //to all inside namaspace. socket oneself included
			//global.jay.emit => TypeError: opts.except is not iterable (from socket.io 3.0)
			socket.broadcast.emit(com.cons.sock_ev_common, { ev : ev, data : data, returnTo : _returnTo, returnToAnother : returnToAnother }) //socket oneself excluded
			socket.emit(com.cons.sock_ev_common, { ev : ev, data : data, returnTo : _returnTo, returnToAnother : returnToAnother })
		},

		sendToRoom : (socket, roomid, param) => {
			//global.jay.to(roomid).emit(com.cons.sock_ev_common, param) //to all inside room. socket oneself included
			//global.jay.to(roomid).emit => TypeError: opts.except is not iterable (from socket.io 3.0)
			socket.to(roomid).emit(com.cons.sock_ev_common, param) //socket oneself excluded
			socket.emit(com.cons.sock_ev_common, param)
		},

		getSocketIdExceptNamespace : (fullid) => {
			if (!fullid) return null
			const _sockidArr = fullid.split('#') //sendjay#sjkfhsaf8934kmhjsfd8
			if (_sockidArr.length == 1) {
				return _sockidArr[0]
			} else {
				return _sockidArr[1]
			}
		},

		getUserkeySocket : (userkey) => { //from redis
			return new Promise((resolve, reject) => {
				let arr = []
				const pattern = com.cons.key_str_socket + userkey + com.cons.easydeli
				const stream = global.store.scanStream({ match : pattern + '*', count: com.cons.scan_stream_cnt })
				stream.on('data', (resultKeys) => {
					for (let key of resultKeys) arr.push(key)
					resolve(arr)
				}) //stream.on('end', () => { resolve(arr) }) //'end' does not guarantee rs.result as defined.
			})
		},

		getUserkeySocketsFromMulti : async (userkeys) => { //from redis
			let usArr = []
			for (let userkey of userkeys) { //[userkey1,userkey2..]
				const arr = await com.getUserkeySocket(userkey)			
				if (arr.length > 0) usArr = usArr.concat(arr)
			}
			return usArr
		},

		getUserkeySocketid : (key) => { //key => $$SD__3;/sendjay#sjkfhsaf8934kmhjsfd8
			const arr = key.split(com.cons.easydeli)
			const _userkey = arr[0].replace(com.cons.key_str_socket, '')
			const _socketid = arr[1]
			return { userkey : _userkey, socketid : _socketid }
		},

		getUserkeysInSocket : async (userkeys) => {
			let ukArr = []
			const resultArr = await com.getUserkeySocketsFromMulti(userkeys)
			const sockets = await global.jay.adapter.sockets(new Set())
			for (let key of resultArr) {
				const _obj = com.getUserkeySocketid(key)
				if (sockets.has(_obj.socketid)) ukArr.push(_obj.userkey)
			}
			return ukArr
		},

		getUserkeySocketArr : async (_userid) => {
			const arr = await com.getUserkeySocket(com.cons.w_key + _userid)
			const brr = await com.getUserkeySocket(com.cons.m_key + _userid)
			return [arr, brr]
		},

		getMyOtherSocket : async (socket) => {
			let myOtherUserkey
			if (socket.userkey.startsWith(com.cons.m_key)) {
				myOtherUserkey = com.cons.w_key + socket.userkey.replace(com.cons.m_key, '')
			} else {
				myOtherUserkey = com.cons.m_key + socket.userkey.replace(com.cons.w_key, '')
			}
			const arr = await com.getUserkeySocket(myOtherUserkey)
			return arr[0] //if not, undefined returned
		},

		sendToMyOtherSocket : async (socket, param) => {
			param.data.userid = socket.userid //see ChatService.kt
			const otherUserkeySocket = await com.getMyOtherSocket(socket)
			if (otherUserkeySocket) com.pub('sendto_myother_socket', { socketid : socket.id, otherkey : otherUserkeySocket, param : param }) //call pmessage()
		},

		joinRoomWithUserkeySocketArr : (userkeySocketArr, _roomid) => new Promise(async (resolve, reject) => { //When open_room or invite_user.
			let _obj
			try {
				for (let key of userkeySocketArr) { //Garbage of socketid might be in userkeySocketArr.
					_obj = com.getUserkeySocketid(key)
					try {
						await global.jay.adapter.remoteJoin(_obj.socketid, _roomid)
					} catch (ex) { //reject(new Error('cannot connect to specific server when remoteJoinging with ' + _obj.userkey))
						if (ex.message.includes('timeout')) { //timeout reached while waiting for remoteJoin response (specific server down)
							//When specific server down and live socket is disconnected, this timeout error occurrs when opening room with that socket.
							//In this case, trouble will be continued when userkey not connected. So, userkey in problem should be skipped for no trouble with opening room.
							//When server restarts or userkey opens room, remoteJoin will be solved with no problem.
							//특정 서버 다운시 그 서버내 연결이 끊어진 소켓이 포함된 톡방을 열 때 이 오류가 발생함
							//이 경우, 해당 userkey가 연결이 안되면 오류가 계속 발생함. 그래서, 해당 userkeys는 open room시 timeout을 만나면 그냥 skip하면 됨 
							//다시 서버가 살거나 사용자가 해당 톡방을 열면 remoteJoin은 문제없이 처리됨
						} else {
							throw new Error(ex.message)
						}
					}
				}
				resolve()
			} catch (ex) {
				if (_obj) {
					global.log.error('joinRoomWithUserkeySocketArr', _obj.userkey + '/' + _obj.socketid + '\n' + ex.stack)
					reject(new Error(_obj.userkey + '/' + ex.message))
				} else {
					resolve()
				}
			}
		}),

		leaveRoomWithUserkeySocketArr : (userkeySocketArr, _roomid) => new Promise(async (resolve, reject) => {
			let _userkey, _socketid
			try {
				for (let key of userkeySocketArr) {
					const arr = key.split(com.cons.easydeli)
					_userkey = arr[0].replace(com.cons.key_str_socket, '')
					_socketid = arr[1]
					try {
						await global.jay.adapter.remoteLeave(_socketid, _roomid)
					} catch (ex) { //reject(new Error('cannot connect to specific server when remoteLeaving with ' + _obj.userkey))
						if (ex.message.includes('timeout')) { //timeout reached while waiting for remoteLeave response (specific server down)
							//Same as joinRoomWithUserkeySocketArr(), one thing different is that re join will not be happened because it was already left.
							//joinRoomWithUserkeySocketArr() 경우와 같지만 한가지 다른 점은 이미 leave하였기 때문에 opening room시 다시 join되지 않을 것임
						} else {
							throw new Error(ex.message)
						}
					}
				}
				if (_userkey && _socketid) resolve()
			} catch (ex) { 
				if (_userkey && _socketid) {
					global.log.error('leaveRoomWithUserkeySocketArr', _userkey + '/' + _socketid + '\n' + ex.stack)
					reject(new Error(_userkey + '/' + ex.message))
				} else {
					reject(new Error('No one left in this room : ') + userkeySocketArr.toString() + '\n' + ex.message)
				}
			}
		}),

		setRoomnmWithUsernm : (data, fieldUserNm, fieldUserId) => {
			let _roomnm = '', _userid = ''
			const len = data.length
			if (len == 1) {
				_roomnm = 'myself'
			} else {				
				for (let i = 0; i < len; i++) {
					if (i > com.cons.max_people_to_display) {
						_roomnm += com.cons.memdeli + 'more..'
						_userid += com.cons.memdeli + 'more..'
						break
					}
					if (_roomnm == '') {
						_roomnm = data[i][fieldUserNm]
						_userid = data[i][fieldUserId]
					} else {
						_roomnm += com.cons.memdeli + data[i][fieldUserNm]
						_userid += com.cons.memdeli + data[i][fieldUserId]
					}					
				}
			}
			return { roomnm : _roomnm, userid : _userid }
		},

		////////////////////////////////////////////////////////////////////////////////belows are for redis.

		//hash******************************
		//await global.store.hmset(key, obj) //obj is 1 depth like { id : "aa", userkey : "bb"}
		//await global.store.del(key)
		//return await global.store.hmget(key, fields) //hmget key field1 field2 .. array returns array
		//return await global.store.hgetall(key) //return object

		//strings******************************
		//await global.store.set(key, value) //setStr
		//return await global.store.get(key) //getStr
		//return await global.store.del(key) //delStr
		//return await global.store.keys(pattern) //keyStr => do not use because this might occur redis lock

		//sets******************************
		//await global.store.sadd(key, value) //addToSet
		//await global.store.srem(key, value) //delFromSet
		//return await global.store.sismember(key, value) //isMemOfSet
		//return await global.store.scard(key) //getSetCount
		//return await global.store.smembers(key) //getSetAll

		pub : (pubKey, obj) => { //obj needs 1 depth object like { id : "aa", userkey : "bb" }
			global.pub.publish(com.cons.prefix + pubKey, JSON.stringify(obj))
		},

		multiSetForUserkeySocket : async (socket) => {
			try {
				const usKey = com.cons.key_str_socket + socket.userkey + com.cons.easydeli + socket.id
				const uwKey = com.cons.key_str_winid + socket.userkey + com.cons.easydeli + socket.winid
				if (usKey.includes('undefined')) throw Error('multiSetForUserkeySocket : usKey not defined')
				if (uwKey.includes('undefined')) throw Error('multiSetForUserkeySocket : uwKey not defined')
				const arr = await global.store.multi().set(usKey, socket.socketid)
											  .set(uwKey, ws.util.getCurDateTimeStr(true)) //See chk_redis.js, too.
										   	  .sadd(com.cons.key_set_userkey_socket, usKey) //.scard(com.cons.key_set_userkey_socket)
										   	  .exec()
				return arr[2][1] //arr = [[null, 'OK'], [null, 'OK'], [null, 99]] => return 99 //for sadd count. smembers $$US for query list
				//'.sadd(com.cons.key_set_userkey_socket, usKey)' is currently in no use but stayed alive for future
			} catch(ex) {
				throw new Error(ex)
			}
		},

		multiDelForUserkeySocket : async (socket) => {
			try {
				const usKey = com.cons.key_str_socket + socket.userkey + com.cons.easydeli + socket.id
				const uwKey = com.cons.key_str_winid + socket.userkey + com.cons.easydeli + socket.winid
				if (usKey.includes('undefined')) throw Error('multiDelForUserkeySocket : usKey not defined')
				if (uwKey.includes('undefined')) throw Error('multiDelForUserkeySocket : uwKey not defined')
				const arr = await global.store.multi().del(usKey)
												 	  .del(uwKey)
										   		 	  .srem(com.cons.key_set_userkey_socket, usKey) //.scard(com.cons.key_set_userkey_socket)
										   		 	  .exec()
				return arr[2][1] //for srem count. smembers $$US for query list
			} catch(ex) {
				throw new Error(ex)
			}
		},

		multiDelGarbageForUserkeySocket : async (usKey, afterScan) => { //usKey = com.cons.key_str_socket + socket.userkey + com.cons.easydeli + socket.id
			try {
				if (usKey.includes('undefined')) throw Error('multiDelGarbageForUserkeySocket : usKey not defined')
				if (afterScan) {
					const stream = store.scanStream({ match : usKey, count : com.cons.scan_stream_cnt })
					stream.on('data', async (resultKeys) => { //Search for userkey's another socketid which might be alive on (other) server(s), and kill them.
						for (let item of resultKeys) {
							await global.store.multi().del(item).srem(com.cons.key_set_userkey_socket, item).exec()
						}
					})
				} else { //scanning not needed since already scanned
					await global.store.multi().del(usKey).srem(com.cons.key_set_userkey_socket, usKey).exec()
				}
			} catch(ex) {
				throw new Error(ex)
			}
		}

	}

	return com

})()
