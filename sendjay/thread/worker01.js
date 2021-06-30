const config = require('../config')
const nodeConfig = require(config.app.nodeConfig)
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const Redis = require('ioredis')
const { parentPort } = require('worker_threads')
//only port80 server

ws.util.addGlobal({ logPath: config.app.logPath, dirName: __dirname }, nodeConfig)
global.pool = wsmysql.createPool(config.mysql.scheme)
const redisOpt = { host : nodeConfig.redis.host, port : nodeConfig.redis.port, password : nodeConfig.redis.pwd, db : config.redis.db }
global.store = new Redis(redisOpt)

const TITLE = 'worker01'
const PREFIX = '$$'
console.log('starting thread: ' + TITLE)

const retData = async (conn, item, prefix) => {
    const arr = item.split(com.cons.easydeli)
    const userkey = arr[0].substring(prefix.length)
    const userid = userkey.split(com.cons.keydeli)[1]
    const qry = "SELECT COUNT(*) CNT, USER_ID, USER_NM FROM " + com.tbl.user + " WHERE USER_ID = ? AND DEL_DATE = '' " //currently employed not retired
    const data = await wsmysql.query(conn, qry, [userid])
    const obj = { data : data, userkey : userkey, userid : userid }
    return obj
}

proc()
async function proc() {
    let conn
    try {
        const stream = global.store.scanStream({ match : com.cons.key_str_socket + '*', count : com.cons.scan_stream_cnt })
        stream.on('data', async (resultKeys) => {
            try { 
                console.log(TITLE, "clearing garbage for socket already connected of unregistred user.") //퇴직한 사용자에 대한 살아 있을 법한 소켓 제거
                if (resultKeys.length == 0) return
                conn = await wsmysql.getConnFromPool(global.pool)
                for (let item of resultKeys) {
                    const obj = await retData(conn, item, com.cons.key_str_socket) //parentPort.on('message', (msg) => { console.log('to worker : ' + msg) })
                    if (obj.data[0].CNT == 0) parentPort.postMessage({ ev : 'del_redis_socket', item : item, userkey : obj.userkey, userid : obj.userid }) 
                }
            } catch (ex) {
                global.log.error(TITLE + ': error: ', ex.stack)
            } finally {
                try { if (conn) wsmysql.closeConn(conn) } catch {}
            }
        })
        const stream1 = global.store.scanStream({ match : PREFIX + '*', count : com.cons.scan_stream_cnt })
        stream1.on('data', async (resultKeys) => {
            try { 
                console.log(TITLE, "clearing garbage for redis of unregistred user.") //퇴직한 사용자에 대한 모든 reids 제거
                if (resultKeys.length == 0) return
                conn = await wsmysql.getConnFromPool(global.pool)
                for (let item of resultKeys) { 
                    if (item.startsWith(com.cons.key_set_userkey_socket)) continue //$$US
                    const prefix = item.substr(0, 3) 
                    const obj = await retData(conn, item, prefix) //userkey
                    if (obj.data[0].CNT == 0) {
                        if (prefix == com.cons.key_str_socket) {
                            await com.multiDelGarbageForUserkeySocket(item)
                        } else {
                            await global.store.multi().del(item).exec()
                        }
                    }
                }
            } catch (ex) {
                global.log.error(TITLE + ': error1: ', ex.stack)
            } finally {
                try { if (conn) wsmysql.closeConn(conn) } catch {}
            }
        })
    } catch (ex) {
        global.log.error(TITLE + ': error2: ', ex.stack)
    } finally {
        setTimeout(() => { proc() }, 1000 * 60 * 60) //1 hour
    }
}

ws.util.watchProcessError()