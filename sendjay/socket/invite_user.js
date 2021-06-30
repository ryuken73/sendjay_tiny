const config = require('../config')
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
//security level (high) : User can access only one's own data.

module.exports = async function(socket, param) {
	const _logTitle = param.ev, _roomid = param.returnTo
	let conn
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param), _roomid)
		let invitedUseridArr = [], invitedUsernmArr = []
		const _useridArr = param.data.userids
		const _usernmArr = param.data.usernms
		const ret = await com.chkAccessUserWithTarget(socket.userid, _roomid, "room")
		if (ret != "") throw new Error(ret)
		conn = await wsmysql.getConnFromPool(global.pool)
		await wsmysql.txBegin(conn)		
		for (let i = 0; i < _useridArr.length; i++) {
			const qry = "SELECT USERID, USERNM, STATE FROM " + com.tbl.roomdtl + " WHERE ROOMID = ? AND USERID = ? "
			const data = await wsmysql.query(conn, qry, [_roomid, _useridArr[i]])
			if (data.length == 0) {
				const iqry = "INSERT INTO " + com.tbl.roomdtl + " (ROOMID, USERID, USERNM, CDT) VALUES (?, ?, ?, sysdate(6)) "
				await wsmysql.query(conn, iqry, [_roomid, _useridArr[i], _usernmArr[i]])
				invitedUseridArr.push(_useridArr[i])
				invitedUsernmArr.push(_usernmArr[i])				
			} else {
				if (data[0].STATE == 'L') {
					const uqry = "UPDATE " + com.tbl.roomdtl + " SET STATE = '', UDT = sysdate(6) WHERE ROOMID = ? AND USERID = ? "
					await wsmysql.query(conn, uqry, [_roomid, _useridArr[i]])
					invitedUseridArr.push(_useridArr[i])
					invitedUsernmArr.push(_usernmArr[i])	
				}
			}
		}
		let useridBrr = [], userkeyArr = [], userkeySocketArr = [], arrUseridSortedByUsernm = [], arrUsernmSortedByUsernm = []
		if (invitedUseridArr.length > 0) {
			const qry = "SELECT USERID, USERNM FROM " + com.tbl.roomdtl + " WHERE ROOMID = ? AND STATE <> 'L' ORDER BY USERNM "
			const data = await wsmysql.query(conn, qry, [_roomid])
			const roomnmObj = com.setRoomnmWithUsernm(data, 'USERNM', 'USERID')
			const len = data.length
			for (let i = 0; i < len; i++) {
				const _userid = data[i].USERID
				useridBrr.push(_userid)
				const _usernm = data[i].USERNM
				arrUseridSortedByUsernm.push(_userid)
				arrUsernmSortedByUsernm.push(_usernm)
				const w_userkey = com.cons.w_key + _userid
				const m_userkey = com.cons.m_key + _userid
				userkeyArr.push(w_userkey)
				userkeyArr.push(m_userkey)
				const arr = await com.getUserkeySocket(w_userkey)
				const brr = await com.getUserkeySocket(m_userkey)
				if (arr.length > 0) userkeySocketArr = userkeySocketArr.concat(arr)
				if (brr.length > 0) userkeySocketArr = userkeySocketArr.concat(brr)
			}		
			useridBrr.sort((a, b) => { return (a > b) ? 1 : (b > a) ? -1 : 0 })
			const _chkSameMembers = useridBrr.length <= com.cons.max_check_same_members ? true : false
			const _useridJoinedEasy = useridBrr.join(com.cons.easydeli)
			await wsmysql.query(conn, "UPDATE " + com.tbl.roommst + " SET MEMCNT = ?, ROOMNM = ?, UDT = sysdate(6) WHERE ROOMID = ? ", [len, JSON.stringify(roomnmObj), _roomid])
			await wsmysql.query(conn, "DELETE FROM " + com.tbl.roommem + " WHERE ROOMID = ? ", [_roomid]) //should be deleted since it might be multi records			
			if (_chkSameMembers) await wsmysql.query(conn, "INSERT INTO " + com.tbl.roommem + " (ROOMID, MEMBERS, CDT) VALUES (?, ?, sysdate(6)) ", [_roomid, _useridJoinedEasy])
			await wsmysql.txCommit(conn)
			await com.joinRoomWithUserkeySocketArr(userkeySocketArr, _roomid)
			param.data.roomnm = JSON.stringify(roomnmObj)
		}
		param.data.roomid = _roomid		
		param.data.receiverid = arrUseridSortedByUsernm
		param.data.receivernm = arrUsernmSortedByUsernm
		param.data.invitedUserids = invitedUseridArr
		param.data.invitedUsernms = invitedUsernmArr
		param.data.userkeys = userkeyArr
		socket.emit(com.cons.sock_ev_common, param)
	} catch (ex) { //com.procWarn(null, socket, _logTitle, com.cons.rs + JSON.stringify(param), _roomid)
		if (conn) await wsmysql.txRollback(conn)
		com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex, _roomid)
	} finally {
		try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
	}
}
