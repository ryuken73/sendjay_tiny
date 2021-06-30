const config = require('../config')
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
//security level (high) : User can access only one's own data.

module.exports = async function(socket, param) {
	const _logTitle = param.ev, _roomid = param.returnTo
	let conn
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param), _roomid)	
		const resVeri = com.verifyWithSocketUserId(param.data.receiverid, socket.userid)
		if (resVeri != '') throw new Error(resVeri)
		conn = await wsmysql.getConnFromPool(global.pool)
		await wsmysql.txBegin(conn)	
		if (param.data.type == 'all') {
			const ret = await com.chkAccessUserWithTarget(socket.userid, _roomid, "room")
			if (ret != "") throw new Error(ret)
			const arg = [_roomid, param.data.receiverid]
			await wsmysql.query(conn, "UPDATE " + com.tbl.msgdtl + " SET UDT = sysdate(6), STATE = 'D' WHERE ROOMID = ? AND RECEIVERID = ? ", arg)
		} else {
			const _msgidArr = param.data.msgidArr
			const _len = _msgidArr.length
			for (let i = 0; i < _len; i++) {
				const ret = await com.chkAccessUserWithTarget(socket.userid, _msgidArr[i], "")
				if (ret != "") throw new Error(ret)
				const arg = [_msgidArr[i], _roomid, param.data.receiverid]
				await wsmysql.query(conn, "UPDATE " + com.tbl.msgdtl + " SET UDT = sysdate(6), STATE = 'D' WHERE MSGID = ? AND ROOMID = ? AND RECEIVERID = ? ", arg)
			}
		}	
		await wsmysql.txCommit(conn)	
		socket.emit(com.cons.sock_ev_common, param)
		com.sendToMyOtherSocket(socket, param)
	} catch (ex) { //com.procWarn(null, socket, _logTitle, com.cons.rs + JSON.stringify(param), _roomid)
		if (conn) await wsmysql.txRollback(conn)
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex, _roomid)
	} finally {
		try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
	}
}
