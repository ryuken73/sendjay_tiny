const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const emoji = require('node-emoji')
//security level (high) : User can access only one's own data.

module.exports = async function(socket, param) {
	const _logTitle = param.ev//, _roomid = param.returnTo => roomid needed in index.html (param.returnTo cannot cover)
	let conn, obj, _cnt, _roomid, userkeyBrr = [], userkeyCrr = [] //userkeyBrr(Web), userkeyCrr(Mobile)
	try { //com.procWarn(null, socket, _logTitle, com.cons.rq + JSON.stringify(param), _roomid)
		obj = param.data
		_roomid = obj.roomid
		const resVeri = com.verifyWithSocketUserId(obj.senderid, socket.userid)
		if (resVeri != '') throw new Error(resVeri)
		const ret = await com.chkAccessUserWithTarget(socket.userid, _roomid, "room")
		if (ret != "") throw new Error(ret)
		conn = await wsmysql.getConnFromPool(global.pool)
		await wsmysql.txBegin(conn)	
		let useridToProc = obj.senderid
		if (obj.type == 'check') {
			const data = await wsmysql.query(conn, "SELECT COUNT(*) CNT, CDT FROM " + com.tbl.msgmst + " WHERE MSGID = ? ", [obj.prevmsgid])
			param.data.msgid = obj.prevmsgid
			param.data.body = data[0].CNT
			param.data.cdt = data[0].CDT
			await wsmysql.txCommit(conn)
			socket.emit(com.cons.sock_ev_common, param)
		} else if (obj.type == 'notice') {
			const kind = obj.body
			if (kind == 'image') { //get image which was uploaded with ajax. arraybuffer sent with blank on socket.io-redis npm
				const data = await wsmysql.query(conn, "SELECT CDT, BUFFER FROM " + com.tbl.msgmst + " WHERE MSGID = ? ", [obj.prevmsgid])
				if (data.length == 0) throw new Error(ws.cons.MSG_NO_DATA + ' : ' + obj.prevmsgid)
				param.data.msgid = obj.prevmsgid
				param.data.cdt = data[0].CDT
				param.data.buffer = data[0].BUFFER //download through socket
				param.data.bufferStr = (data[0].BUFFER) ? 'Y' : null //(data[0].BUFFER) ? Buffer.from(data[0].BUFFER, 'binary').toString('base64') : null //see get_sublink.js
				param.data.type = kind
			} else if (kind == 'file') { //get image which was uploaded with ajax. arraybuffer sent with blank on socket.io-redis npm
				const data = await wsmysql.query(conn, "SELECT CDT, BODY, FILESTATE FROM " + com.tbl.msgmst + " WHERE MSGID = ? ", [obj.prevmsgid])
				if (data.length == 0) throw new Error(ws.cons.MSG_NO_DATA + ' : ' + obj.prevmsgid)
				param.data.msgid = obj.prevmsgid
				param.data.cdt = data[0].CDT
				param.data.body = data[0].BODY
				param.data.filestate = data[0].FILESTATE
				param.data.type = kind				
			}
			const _len = param.data.receiverid.length
			for (let i = 0; i < _len; i++) {
				userkeyBrr.push(com.cons.w_key + param.data.receiverid[i])
				userkeyCrr.push(com.cons.m_key + param.data.receiverid[i])
			}
			param.data.userkeyArr = await com.getUserkeysInSocket(userkeyBrr) //See ChatService.kt
			param.data.userid = socket.userid //in order for sendToMyOtherSocket and sendToRoom
			await wsmysql.txCommit(conn)
			com.sendToRoom(socket, _roomid, param) //global.jay.to(_roomid).emit(com.cons.sock_ev_common, param)
		} else { //type = talk,flink,invite,leave
			const data = await wsmysql.query(conn, "SELECT COUNT(*) CNT, sysdate(6) CURDT FROM " + com.tbl.roomdtl + " WHERE ROOMID = ? ", [_roomid])
			_cnt = data[0].CNT
			param.data.cdt = data[0].CURDT //dateStrings:'date' in mysql npm //? data[0].CURDT : ws.util.getCurDateTimeStr(true) //for timezone
			let _sql
			if (obj.type == 'leave') {				
				if (obj.reply && obj.reply != obj.senderid) { //make someone leave. 강제퇴장
					useridToProc = obj.reply
					const dataA = await wsmysql.query(conn, "SELECT COUNT(*) CNT FROM " + com.tbl.user + " WHERE USER_ID = ? AND DEL_DATE = '' ", [useridToProc])
					if (dataA[0].CNT > 0) throw new Error('Only unregistered user can be processed : ' + useridToProc) 
				}
				if (_cnt == 2) {
					_sql = "UPDATE " + com.tbl.roomdtl + " SET STATE = '2' WHERE ROOMID = '" + _roomid + "' AND USERID = '" + useridToProc + "' "
				} else {
					_sql = "UPDATE " + com.tbl.roomdtl + " SET STATE = 'L', UDT = ? WHERE ROOMID = '" + _roomid + "' AND USERID = '" + useridToProc + "' "
				}
				await wsmysql.query(conn, _sql, [param.data.cdt])
				const uqry = "UPDATE " + com.tbl.msgdtl + " SET STATE = 'D', UDT = ? WHERE ROOMID = ? AND RECEIVERID = ? "
				await wsmysql.query(conn, uqry, [param.data.cdt, _roomid, useridToProc])
				if (_cnt != 2) {
					let userkeyArr = [ ], arrUseridSortedByUsernm = [], arrUsernmSortedByUsernm = []
					const qry = "SELECT USERID, USERNM FROM " + com.tbl.roomdtl + " WHERE ROOMID = ? AND STATE <> 'L' ORDER BY USERNM "
					const dataDtl = await wsmysql.query(conn, qry, [_roomid])
					const roomnmObj = com.setRoomnmWithUsernm(dataDtl, 'USERNM', 'USERID')
					const len = dataDtl.length
					for (let i = 0; i < len; i++) {
						const _userid = dataDtl[i].USERID						
						arrUseridSortedByUsernm.push(_userid)
						arrUsernmSortedByUsernm.push(dataDtl[i].USERNM)
						const w_userkey = com.cons.w_key + _userid
						const m_userkey = com.cons.m_key + _userid
						userkeyArr.push(w_userkey)
						userkeyArr.push(m_userkey)
					}
					const _chkSameMembers = len <= com.cons.max_check_same_members ? true : false
					await wsmysql.query(conn, "UPDATE " + com.tbl.roommst + " SET MEMCNT = ?, ROOMNM = ?, UDT = ? WHERE ROOMID = ? ", [len, JSON.stringify(roomnmObj), param.data.cdt, _roomid])
					await wsmysql.query(conn, "DELETE FROM " + com.tbl.roommem + " WHERE ROOMID = ? ", [_roomid]) //should be deleted since it might be multi records			
					const qryMem = "SELECT GROUP_CONCAT(USERID separator '" + com.cons.easydeli + "') USERIDS FROM " + com.tbl.roomdtl + " WHERE ROOMID = ? AND STATE <> 'L' ORDER BY USERID "
					const dataMem = await wsmysql.query(conn, qryMem, [_roomid])
					if (_chkSameMembers) await wsmysql.query(conn, "INSERT INTO " + com.tbl.roommem + " (ROOMID, MEMBERS, CDT) VALUES (?, ?, ?) ", [_roomid, dataMem[0].USERIDS, param.data.cdt])
					param.data.roomnm = JSON.stringify(roomnmObj)
					param.data.receiverid = arrUseridSortedByUsernm
					param.data.receivernm = arrUsernmSortedByUsernm
					param.data.userkeys = userkeyArr
				}
			}
			if (obj.type == 'leave' && _cnt <= 2) {
				await wsmysql.txCommit(conn)
				socket.emit(com.cons.sock_ev_common, param)
				com.sendToMyOtherSocket(socket, param)
			} else {
				if (obj.type != 'leave' && _cnt <= 2) {
					_sql = "UPDATE " + com.tbl.roomdtl + " SET STATE = '' WHERE ROOMID = '" + _roomid + "' AND STATE = '2' "
					await wsmysql.query(conn, _sql, null)
				}
				let bodyForInsert
				if (obj.type == 'talk' && ws.util.chkEmoji(obj.body)) {
					bodyForInsert = emoji.unemojify(obj.body)
					if (ws.util.utf8StrByteLength(bodyForInsert) > com.cons.max_msg_len) throw new Error('Max size of talk is ' + com.cons.max_msg_len + '. Now is ' + ws.util.utf8StrByteLength(bodyForInsert) + '.') 
				} else {
					bodyForInsert = obj.body
				}
				let iqry = "INSERT INTO " + com.tbl.msgmst + " (MSGID, ROOMID, SENDERID, SENDERNM, BODY, REPLY, TYPE, CDT, FILESTATE) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
				await wsmysql.query(conn, iqry, [obj.msgid, _roomid, useridToProc, obj.sendernm, bodyForInsert, obj.reply, obj.type, param.data.cdt, obj.filestate])
				const _state = (obj.type == 'leave') ? 'R' : '' //Inserting R to 'STATE' field in advance for 'leave' message gives good sql performance in qry_unread.js
				const _len = param.data.receiverid.length //should not be obj but param.data since 'leave' exclude himself
				for (let i = 0; i < _len; i++) {
					iqry = "INSERT INTO " + com.tbl.msgdtl + " (MSGID, ROOMID, SENDERID, RECEIVERID, RECEIVERNM, CDT, STATE) VALUES (?, ?, ?, ?, ?, ?, ?) "
					await wsmysql.query(conn, iqry, [obj.msgid, _roomid, useridToProc, param.data.receiverid[i], param.data.receivernm[i], param.data.cdt, _state])
					//When PC(Web) and Mobile are online, notification should be handled carefully since both of notification might bother receiver(user)
					//PC와 모바일 모두 online일 경우, 알림이 둘 다 동시에 가면 수신인 입장에서 귀찮을 수 있으므로 방안이 필요함 
					userkeyBrr.push(com.cons.w_key + param.data.receiverid[i])
					userkeyCrr.push(com.cons.m_key + param.data.receiverid[i])
				}
				param.data.userkeyArr = await com.getUserkeysInSocket(userkeyBrr) //See ChatService.kt
				param.data.userid = socket.userid //in order for sendToMyOtherSocket and sendToRoom
				await wsmysql.txCommit(conn)
				com.sendToRoom(socket, _roomid, param) //global.jay.to(_roomid).emit(com.cons.sock_ev_common, param)
			}
			if (obj.type == 'leave' && _cnt > 2) {
				setTimeout(async function() {
					try {
						let userkeySocketArr = [ ]
						const arr = await com.getUserkeySocket(com.cons.w_key + useridToProc)
						const brr = await com.getUserkeySocket(com.cons.m_key + useridToProc)
						if (arr.length > 0) userkeySocketArr = userkeySocketArr.concat(arr)
						if (brr.length > 0) userkeySocketArr = userkeySocketArr.concat(brr)
						await com.leaveRoomWithUserkeySocketArr(userkeySocketArr, _roomid)
					} catch (ex) {
						com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex, _roomid)
					}
				}, 1000)
			}
		}
		if (obj.type != 'check' && obj.type != 'leave') { //push(fcm/apns) sending to userkeys who are not connected
			const userkeyArrInSocket = await com.getUserkeysInSocket(userkeyCrr)
			const userkeyArrNotInSocket = userkeyCrr.filter(item => !userkeyArrInSocket.includes(item))
			const _len = userkeyArrNotInSocket.length
			for (let i = 0; i < _len; i++) {				
				if (userkeyArrNotInSocket[i].startsWith(com.cons.m_key)) {
					const userid = userkeyArrNotInSocket[i].replace(com.cons.m_key, '')
					const sqry = "SELECT OS_INUSE, PUSH_IOS, PUSH_AND FROM " + com.tbl.user + " WHERE USER_ID = ? AND DEL_DATE = '' "
					const sdata = await wsmysql.query(conn, sqry, [userid]) //Notice that txCommit has already done above.
					if (sdata.length == 0) continue //console.log(userkeyArrNotInSocket[i]+"===="+sdata[0].PUSH_AND)
					if (sdata[0].OS_INUSE == 'ios' && sdata[0].PUSH_IOS != com.cons.invalid_push_token) {
						//later
					} else if (sdata[0].OS_INUSE == 'and' && sdata[0].PUSH_AND != com.cons.invalid_push_token) {
						let msg = {
							data: { //Every key name should be equal to socket's data (param.data) since Android app use these things for notification.
								msgid : param.data.msgid, 
								senderkey : param.data.senderkey, 
								senderid : param.data.senderid, 
								body : 'fcm) ' + param.data.body, //fcm) is temporary test for distinguish it from socket message.  
								type : param.data.type, 
								userkeyArr : param.data.userkeyArr.toString(), 
								roomid : param.data.roomid,
								cdt : param.data.cdt
							},
							android: {
								priority: "high"
							},
							token: sdata[0].PUSH_AND
						} //https://noonestaysthesame.tistory.com/m/17
						global.fcm.messaging().send(msg, false) //dryRun=false callback not found on google's sdk document
						.then(async (rs) => { //rs=projects/sendjay-d712c/messages/0:1619162645061012%3a7eb762f9fd7ecd
							const dsql = "UPDATE " + com.tbl.msgdtl + " SET PUSH_ERR = ? WHERE MSGID = ? AND ROOMID = ? "
							await wsmysql.query(conn, dsql, ['fcm_ok', param.data.msgid, param.data.roomid])
						}).catch(async (err) => { //Error Code : https://firebase.google.com/docs/cloud-messaging/send-message?hl=ko	
							const dsql = "UPDATE " + com.tbl.msgdtl + " SET PUSH_ERR = ? WHERE MSGID = ? AND ROOMID = ? " //100byte
							let code = (err.errorInfo) ? err.errorInfo.code : err.code
							let msg = (err.errorInfo) ? err.errorInfo.message : 'Unknown Error'
							let _msg = 'fcm_err/' + code  + '/' + msg
							_msg = _msg.length > 100 ? _msg.substr(0, 100) : _msg //max 100byte
							console.log(userid, _msg)
							await wsmysql.query(conn, dsql, [_msg, param.data.msgid, param.data.roomid]) //Even if error occurs, talk will be sent.
							if (_msg.includes('The registration token is not a valid')) {
								const usql = "UPDATE " + com.tbl.user + " SET PUSH_AND = ? WHERE USER_ID = ? "
								await wsmysql.query(conn, usql, [com.cons.invalid_push_token, userid])
							}
						})						
					}
				}
			}
		} //com.procWarn(null, socket, _logTitle, com.cons.rs + JSON.stringify(param), _roomid)
	} catch (ex) {
		if (conn) await wsmysql.txRollback(conn)
		try {
			if (obj.type != 'leave') {
				param.data.errcd = ws.cons.RESULT_ERR
				param.data.errmsg = ex.message
				socket.emit(com.cons.sock_ev_common, param)
				com.procWarn(null, socket, _logTitle, ex, _roomid)
			} else {
				com.procWarn(com.cons.sock_ev_alert, socket, _logTitle, ex, _roomid)
			}			
		} catch (ex1) {}
	} finally {
		try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
	}
}
