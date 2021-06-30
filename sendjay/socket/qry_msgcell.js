const config = require('../config')
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
//security level (high) : User can access only one's own data.

module.exports = async function(socket, param) {
	const _logTitle = param.ev, _roomid = param.returnTo
	let conn
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param), _roomid)
		const ret = await com.chkAccessUserWithTarget(socket.userid, param.data.msgid, "")
		if (ret != "") throw new Error(ret)
		conn = await wsmysql.getConnFromPool(global.pool)			
		let qry = "SELECT MSGID, ROOMID, BODY, BUFFER, TYPE, STATE, FILESTATE FROM " + com.tbl.msgmst + " WHERE MSGID = ? "
		const data = await wsmysql.query(conn, qry, [param.data.msgid]) //roomid excluded since this sql might query msgid with another roomid
		param.data.result = data //BUFFER not good for mobile since it is transmitted through App -> WebView by text data.
		socket.emit(com.cons.sock_ev_common, param)
	} catch (ex) { //com.procWarn(null, socket, _logTitle, com.cons.rs + JSON.stringify(param), _roomid) //watch out for buffer data
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex, _roomid)
	} finally {
		try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
	}
}
