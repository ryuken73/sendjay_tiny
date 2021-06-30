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
		await wsmysql.txBegin(conn)	
		let data = await wsmysql.query(conn, "SELECT TIMEDIFF(sysdate(6), CDT) GAP FROM A_MSGMST_TBL WHERE MSGID = ? ", [param.data.msgid])
		if (data.length == 0) throw new Error(ws.cons.MSG_NO_DATA + ' : ' + param.data.msgid)
		if (data[0].GAP > '24:00:00') throw new Error('It should be handled within 24 hours after sending.')
		await wsmysql.query(conn, "UPDATE " + com.tbl.msgdtl + " SET UDT = sysdate(6), STATE = 'R' WHERE MSGID = ? AND SENDERID = ? AND SENDERID = RECEIVERID ", [param.data.msgid, param.data.senderid])
		await wsmysql.query(conn, "UPDATE " + com.tbl.msgdtl + " SET UDT = sysdate(6), STATE = 'D' WHERE MSGID = ? AND STATE = '' ", [param.data.msgid])
		await wsmysql.query(conn, "UPDATE " + com.tbl.msgmst + " SET UDT = sysdate(6), BODY = ?, BUFFER = null WHERE MSGID = ? ", [com.cons.cell_revoked, param.data.msgid])
		await wsmysql.txCommit(conn)
		//Also file has to be deleted, however garbage is left when closing window during file upload so that all together should be deleted though daemon.
		//원래 파일도 삭제해야 하나 파일업로드시 브라우저창 닫기로 인한 가비지는 데몬으로 처리해야 하므로 모두 합쳐서 데몬으로 처리하기로 함
		com.sendToRoom(socket, _roomid, param)
	} catch (ex) { //com.procWarn(null, socket, _logTitle, com.cons.rs + JSON.stringify(param), _roomid)
		if (conn) await wsmysql.txRollback(conn)
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex, _roomid)
	} finally {
		try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
	}
}
