const config = require('../config')
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
//security level (high) : User can access only one's own data.

module.exports = async function(socket, param) {
	const _logTitle = param.ev, _roomid = param.returnTo
	let conn
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param), _roomid)
		const resVeri = com.verifyWithSocketUserId(param.data.userid, socket.userid)
		if (resVeri != '') throw new Error(resVeri)	
		const ret = await com.chkAccessUserWithTarget(socket.userid, _roomid, "room")
		if (ret != "") throw new Error(ret)
		const _type = param.data.type //all or one(self)
		const _roomname = param.data.roomname
		const _userid = param.data.userid
		const uqry = "UPDATE " + com.tbl.roomdtl + " SET UDT = sysdate(6), NICKNM = ? WHERE ROOMID = ? AND USERID = ? "
		conn = await wsmysql.getConnFromPool(global.pool)
		const data = await wsmysql.query(conn, "SELECT MASTERID, ROOMNM FROM " + com.tbl.roommst + " WHERE ROOMID = ? ", [_roomid])
		if (_type == 'all') {			
			if (data[0].MASTERID == _userid) {
				await wsmysql.query(conn, uqry, [_roomname, _roomid, _userid])
				await wsmysql.query(conn, "UPDATE " + com.tbl.roommst + " SET UDT = sysdate(6), NICKNM = ? WHERE ROOMID = ? ", [_roomname, _roomid]) 
				com.sendToRoom(socket, _roomid, param)
			} else {
				throw new Error('Ony owner of room can change room name for every user')
			}			
		} else {
			await wsmysql.query(conn, uqry, [_roomname, _roomid, _userid])
			if (data[0].MASTERID == _userid) {
				await wsmysql.query(conn, "UPDATE " + com.tbl.roommst + " SET UDT = sysdate(6), NICKNM = '' WHERE ROOMID = ? ", [_roomid]) 
				com.sendToRoom(socket, _roomid, param)
			} else {
				socket.emit(com.cons.sock_ev_common, param)
				com.sendToMyOtherSocket(socket, param)
			}
		}
	} catch (ex) { //com.procWarn(null, socket, _logTitle, com.cons.rs + JSON.stringify(param), _roomid)
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex, _roomid)
	} finally {
		try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
	}
}
