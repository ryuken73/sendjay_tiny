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
			const _userid = req.cookies.userid
			const qry = "SELECT COUNT(*) CNT FROM " + com.tbl.user + " WHERE USER_ID = ? AND DEL_DATE = '' "
			const data = await wsmysql.query(conn, qry, [_userid])
			if (data[0].CNT == 0) {
				rs.code = ws.cons.RESULT_ERR
				rs.msg = 'User ID (' + _userid + ') not exists.'
			} else {
				let _nicknm = decodeURIComponent(req.body.nicknm) || ''
				const _job = decodeURIComponent(req.body.job) || ''
				const _abcd = decodeURIComponent(req.body.abcd) || ''
				const _abnm = decodeURIComponent(req.body.abnm) || ''
				const _standalone = req.body.standalone
				const _notioff = req.body.notioff
				const _soundoff = req.body.soundoff
				const _fr = req.body.fr
				const _to = req.body.to
				const _bodyoff = req.body.bodyoff
				const _senderoff = req.body.senderoff
				if (ws.util.chkEmoji(_nicknm)) {
					_nicknm = emoji.unemojify(_nicknm)
					if (ws.util.utf8StrByteLength(_nicknm) > com.cons.max_nicknm_len) {
						rs.code = ws.cons.RESULT_ERR
						rs.msg = 'Max size of Nick Name is ' + com.cons.max_nicknm_len + '. Now is ' + ws.util.utf8StrByteLength(_nicknm) + '.'
						resolve(rs)
					}
				}
				const uqry = "UPDATE " + com.tbl.user + " SET NICK_NM = ?, JOB = ?, AB_CD = ?, AB_NM = ?, STANDALONE = ?, NOTI_OFF = ?, " + 
								" SOUND_OFF = ?, TM_FR = ?, TM_TO = ?, BODY_OFF = ?, SENDER_OFF = ?, MODR = ?, MODDT = sysdate(6) " +
								" WHERE USER_ID = ? "
				await wsmysql.query(conn, uqry, [_nicknm, _job, _abcd, _abnm, _standalone, _notioff, _soundoff, _fr, _to, _bodyoff, _senderoff, _userid, _userid])
			}
			resolve(rs)
		} catch (ex) {
			reject(ex)
		} finally {
			try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
		}
	})
}

router.post('/', async (req, res) => {
	const _logTitle = 'proc_env.router.post'
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
