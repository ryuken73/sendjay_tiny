const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
//security level (high) : User can access only one's own data (with sql as follows).

module.exports = async function(socket, param) {
	const _logTitle = param.ev, _roomid = param.returnTo
	let conn
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param), _roomid)	
		const obj = param.data	
		if (obj.type == 'updateall' || obj.type == 'update') {
			const resVeri = com.verifyWithSocketUserId(obj.receiverid, socket.userid)
			if (resVeri != '') throw new Error(resVeri)		
		}
		param.data.userid = socket.userid //1) see ChatService.kt 2) in order to sendToMyOtherSocket for mobile noti cancelling	
		let qry, uqry, dataCnt
		conn = await wsmysql.getConnFromPool(global.pool)
		const dateFr = ws.util.setDateAdd(new Date(), com.cons.max_days_to_fetch)	
		await wsmysql.txBegin(conn)		
		if (obj.type == 'updateall') {
			qry = "SELECT COUNT(*) CNT FROM " + com.tbl.msgdtl + " WHERE ROOMID = ? AND RECEIVERID = ? AND STATE = '' AND CDT >= ? "
			dataCnt = await wsmysql.query(conn, qry, [_roomid, obj.receiverid, dateFr])
			if (dataCnt[0].CNT > 0) {
				uqry = "UPDATE " + com.tbl.msgdtl + " SET STATE = 'R' WHERE ROOMID = ? AND RECEIVERID = ? AND STATE = '' AND CDT >= ? "
				await wsmysql.query(conn, uqry, [_roomid, obj.receiverid, dateFr]) //update all
			}
			await wsmysql.txCommit(conn)
			if (dataCnt[0].CNT > 0) { //need to update unread count for all members
				com.sendToRoom(socket, _roomid, param) //global.jay.to(_roomid).emit(com.cons.sock_ev_common, param)
			} else {
				socket.emit(com.cons.sock_ev_common, param)
				com.sendToMyOtherSocket(socket, param)
			}
		} else if (obj.type == 'getmembers') {
			qry = "SELECT RECEIVERNM FROM " + com.tbl.msgdtl + " WHERE MSGID = ? AND ROOMID = ? AND STATE = '' AND CDT >= ? ORDER BY RECEIVERNM "
			const data = await wsmysql.query(conn, qry, [obj.msgid, _roomid, dateFr])
			param.data.unread_list = data
			await wsmysql.txCommit(conn)
			socket.emit(com.cons.sock_ev_common, param)
		} else if (obj.type == 'update') {
			qry = "SELECT COUNT(*) CNT FROM " + com.tbl.msgdtl + " WHERE MSGID = ? AND ROOMID = ? AND CDT >= ? "
			dataCnt = await wsmysql.query(conn, qry, [obj.msgid, _roomid, dateFr])
			if (dataCnt[0].CNT == 0) { //might be no record at first right after sending talk
				param.data.unread_cnt = -1
			} else {
				uqry = "UPDATE " + com.tbl.msgdtl + " SET STATE = 'R' WHERE MSGID = ? AND ROOMID = ? AND RECEIVERID = ? AND STATE = '' AND CDT >= ? "
				await wsmysql.query(conn, uqry, [obj.msgid, _roomid, obj.receiverid, dateFr])
				qry = "SELECT COUNT(*) CNT FROM " + com.tbl.msgdtl + " WHERE MSGID = ? AND ROOMID = ? AND STATE = '' AND CDT >= ? "
				dataCnt = await wsmysql.query(conn, qry, [obj.msgid, _roomid, dateFr])
				param.data.unread_cnt = dataCnt[0].CNT
			}
			await wsmysql.txCommit(conn)
			com.sendToRoom(socket, _roomid, param) //global.jay.to(_roomid).emit(com.cons.sock_ev_common, param)
		} else if (obj.type == 'query') {
			let unreadArr = []
			for (let msgid of obj.msgidArr) {
				qry = "SELECT COUNT(*) CNT FROM " + com.tbl.msgdtl + " WHERE MSGID = ? AND ROOMID = ? AND CDT >= ? "
				dataCnt = await wsmysql.query(conn, qry, [msgid, _roomid, dateFr])
				if (dataCnt[0].CNT == 0) { //might be no record at first right after sending talk
					unreadArr.push(-1)
				} else {
					qry = "SELECT COUNT(*) CNT FROM " + com.tbl.msgdtl + " WHERE MSGID = ? AND ROOMID = ? AND STATE = '' AND CDT >= ? "
					dataCnt = await wsmysql.query(conn, qry, [msgid, _roomid, dateFr])
					unreadArr.push(dataCnt[0].CNT)
				}
			}
			param.data.unreadArr = unreadArr
			await wsmysql.txCommit(conn)
			socket.emit(com.cons.sock_ev_common, param)
		} //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param), _roomid)			
	} catch (ex) {
		if (conn) await wsmysql.txRollback(conn)
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex, _roomid)
	} finally {
		try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
	}
}
