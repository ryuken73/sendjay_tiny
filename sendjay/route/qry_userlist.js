const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const express = require('express')
const router = express.Router()
const emoji = require('node-emoji')
//security level (low) : Every user can access all data but verifying user added.

const proc = (req) => {
	return new Promise(async (resolve, reject) => {
		let conn
		try {
			let rs = ws.web.rsInit()
			conn = await wsmysql.getConnFromPool(global.pool)
			const _type = req.query.type //orgcd, search(index.html) or userids(chat.html)	
			const _keyword = decodeURIComponent(req.query.keyword) || ''
			let qry = "SELECT USER_ID, USER_NM, NICK_NM, ORG_CD, JOB, TEL_NO, AB_CD, AB_NM, ORG_CD, ORG_NM, TOP_ORG_CD, TOP_ORG_NM, DEL_DATE, OS_INUSE, PUSH_IOS, PUSH_AND "
			qry += "     FROM " + com.tbl.user + " "
			if (_type == 'orgcd') {
				qry += "WHERE ORG_CD = '" + _keyword + "' AND DEL_DATE = '' "
			} else if (_type == 'search') {
				qry += "WHERE DEL_DATE = '' AND (USER_NM LIKE '%" + _keyword + "%' OR NICK_NM LIKE '%" + _keyword + "%' OR TEL_NO LIKE '%" + _keyword + "%') "
			} else { //userids
				qry += "WHERE USER_ID IN ('" + _keyword + "') " //DEL_DATE condition excluded (when chat room opened and making unregistered user leave)
			}
			qry += "ORDER BY USER_NM, USER_ID "
			const data = await wsmysql.query(conn, qry, null)
			const len = data.length
			if (len == 0) {
				rs.code = ws.cons.WARN_NOT_EXIST
				rs.msg = ws.cons.MSG_NO_DATA
			} else {
				for (let i = 0; i < len; i++) {
					if (ws.util.chkShouldEmoji(data[i].NICK_NM)) data[i].NICK_NM = emoji.emojify(data[i].NICK_NM)
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
	const _logTitle = 'qry_userlist.router.get'
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