const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const express = require('express')
const router = express.Router()
const emoji = require('node-emoji')
//security level (high) : User can access only one's own data.

const proc = (req) => {
	return new Promise(async (resolve, reject) => {
		let conn
		try {
			let rs = ws.web.rsInit()
			conn = await wsmysql.getConnFromPool(global.pool)
			const dateFr = ws.util.setDateAdd(new Date(), com.cons.max_days_to_fetch)
			const _type = req.query.type
			const _userid = req.cookies.userid
			const _roomid = req.query.roomid
			const _keyword = decodeURIComponent(req.query.keyword) || ''
			let _dt = req.query.dt
			const _start = req.query.start
			const _end = req.query.end
			const _senderid = req.query.senderid
			const _cnt = parseInt(req.query.cnt)
			if (_type == 'after') {
				const qryA = "SELECT CDT FROM " + com.tbl.msgmst + " WHERE MSGID = ? AND ROOMID = ? "
				const dataA = await wsmysql.query(conn, qryA, [_keyword, _roomid])
				if (dataA.length == 0) {
					rs.code = ws.cons.WARN_NOT_EXIST
					rs.msg = ws.cons.MSG_NO_DATA
					resolve(rs)
				}
				_dt = dataA[0].CDT
			}
			let arg //console.log(dateFr, _type, _userid, _roomid, _keyword, _dt, _start, _end, _senderid, _cnt)
			let qry = "SELECT A.MSGID, A.CDT, A.SENDERID, A.SENDERNM, B.RECEIVERID, A.BODY, A.BUFFER, A.REPLY, A.TYPE, B.STATE, A.FILESTATE, "
			qry += "		  CASE WHEN A.BUFFER IS NULL THEN NULL ELSE 'Y' END BUFFERSTR, " 
			qry += "          (SELECT COUNT(*) FROM " + com.tbl.msgdtl + " WHERE MSGID = B.MSGID AND ROOMID = B.ROOMID AND STATE = '') CNT "
			qry += "     FROM " + com.tbl.msgdtl + " B "
			qry += "	 LEFT OUTER JOIN " + com.tbl.msgmst + " A ON B.MSGID = A.MSGID "
			qry += "	WHERE B.ROOMID = ? AND B.RECEIVERID = ? AND B.STATE IN ('', 'R') AND A.CDT >= ? "
			if (_type == 'search') {
				qry += "  AND A.BODY LIKE '%" + _keyword + "%' "
				qry += "ORDER BY A.CDT LIMIT 0, ? "
				arg = [_roomid, _userid, dateFr, _cnt]
			} else if (_type == 'etc') {
				qry += "  AND (A.TYPE IN ('file', 'flink', 'image') OR (A.TYPE = 'talk' AND (A.BODY LIKE '%http://%' OR A.BODY LIKE '%https://%'))) "
				qry += "  AND A.BODY <> '" + com.cons.cell_revoked + "' "
				qry += "ORDER BY A.CDT LIMIT 0, ? "
				arg = [_roomid, _userid, dateFr, _cnt]
			} else if (_type == 'result') {
				qry += "  AND A.CDT >= ? AND A.CDT < ? "
				qry += "ORDER BY A.CDT DESC "
				arg = [_roomid, _userid, dateFr, _start, _end]
			} else if (_type == 'onlyone') {
				qry += "  AND A.CDT < ? "
				qry += "  AND B.SENDERID = ? "
				qry += "ORDER BY A.CDT DESC LIMIT 0, ? "
				arg = [_roomid, _userid, dateFr, _dt, _senderid, _cnt]
			} else if (_type == 'after') { //from mobile (before noti). UDT needed for checking revoked msg when connect after disconnect
				qry += "  AND (A.CDT > ? OR A.UDT > ?) "
				qry += "ORDER BY A.CDT "
				arg = [_roomid, _userid, dateFr, _dt, _dt]			
			} else { //normal
				qry += "  AND A.CDT < ? "
				qry += "ORDER BY A.CDT DESC LIMIT 0, ? "
				arg = [_roomid, _userid, dateFr, _dt, _cnt]
			}
			const data = await wsmysql.query(conn, qry, arg)
			const len = data.length
			if (len == 0) {
				rs.code = ws.cons.WARN_NOT_EXIST
				rs.msg = ws.cons.MSG_NO_DATA
			} else {
				for (let i = 0; i < len; i++) {
					if (data[i].TYPE == 'talk' && ws.util.chkShouldEmoji(data[i].BODY)) data[i].BODY = emoji.emojify(data[i].BODY)
				}
				rs.list = data
			}
			resolve(rs)
		} catch (ex) {
			reject(ex)
		} finally {
			try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
		}
	})
}

router.get('/', async (req, res) => {
	const _logTitle = 'qry_msglist.router.get'
	try {
		const result = await com.verifyWithRestUserId(req, res, null, _logTitle)
		if (!result) return
		const rs = await proc(req)
		res.json(rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router