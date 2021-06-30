const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const express = require('express')
const router = express.Router()
const emoji = require('node-emoji')

const loginProc = (req, userid, pwd, passkey) => {
	return new Promise(async (resolve, reject) => {
		let conn
		try {
			let rs = ws.web.rsInit()
			conn = await wsmysql.getConnFromPool(global.pool)
			const qry = "SELECT USER_ID, PWD, USER_NM, PASSKEY, ORG_CD, ORG_NM, NICK_NM, JOB, AB_CD, AB_NM, STANDALONE, NOTI_OFF, " +
						"       SOUND_OFF, TM_FR, TM_TO, BODY_OFF, SENDER_OFF, PICTURE, ROLE, OS_INUSE, PUSH_IOS, PUSH_AND " +
						"  FROM " + com.tbl.user + " WHERE USER_ID = ? AND DEL_DATE = '' "
			const data = await wsmysql.query(conn, qry, [userid])
			if (data.length == 0) {
				rs.code = ws.cons.WARN_NOT_EXIST
				rs.msg = 'Userid' + ws.cons.MSG_NOT_EXIST
				resolve(rs)
			}
			if (typeof pwd != 'undefined' && pwd != null) { 
				const _dec = ws.util.decrypt(data[0].PWD, nodeConfig.crypto.key)
				if (_dec != pwd) {
					rs.code = ws.cons.WARN_PASSWORD_NOT_MATCHED
					rs.msg = 'Password not matched.'
					resolve(rs)
				}
			} //console.log('login', userid, data[0].USER_NM, '::::', req.clientIp)
			if (req.query.os == 'and') {
				if (data[0].OS_INUSE != req.query.os || data[0].PUSH_AND != req.query.push_and) {
					await wsmysql.query(conn, "UPDATE " + com.tbl.user + " SET OS_INUSE = ?, PUSH_AND = ? WHERE USER_ID = ? ", [req.query.os, req.query.push_and, userid])
				}
			} else if (req.query.os == 'ios') {
				if (data[0].OS_INUSE != req.query.os || data[0].PUSH_IOS != req.query.push_ios) {
					await wsmysql.query(conn, "UPDATE " + com.tbl.user + " SET OS_INUSE = ?, PUSH_IOS = ? WHERE USER_ID = ? ", [req.query.os, req.query.push_ios, userid])
				}
			}
			rs.userid = userid			
			rs.usernm = data[0].USER_NM
			rs.passkey = data[0].PASSKEY
			rs.orgcd = data[0].ORG_CD
			rs.orgnm = data[0].ORG_NM
			rs.toporgcd = data[0].TOP_ORG_CD
			rs.toporgnm = data[0].TOP_ORG_NM
			rs.nicknm = ws.util.chkShouldEmoji(data[0].NICK_NM) ? emoji.emojify(data[0].NICK_NM) : data[0].NICK_NM
			rs.job = data[0].JOB
			rs.abcd = data[0].AB_CD
			rs.abnm = data[0].AB_NM
			rs.standalone = data[0].STANDALONE
			rs.notioff = data[0].NOTI_OFF
			rs.soundoff = data[0].SOUND_OFF
			rs.fr = data[0].TM_FR
			rs.to = data[0].TM_TO
			rs.bodyoff = data[0].BODY_OFF
			rs.senderoff = data[0].SENDER_OFF
			rs.picture = (data[0].PICTURE) ? 'Y' : null //(data[0].PICTURE) ? Buffer.from(data[0].PICTURE, 'binary').toString('base64') : null
			rs.role = data[0].ROLE
			resolve(rs)
		} catch (ex) {
			reject(ex)
		} finally {
			try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
		}
	})
}

const retJson = (res, rs) => {
	rs.token = com.makeToken(rs.userid, rs.passkey) //Create token and send with response (not cookie)
	res.json(rs)
}

router.get('/verify', async (req, res) => { //Auto Login with JWT. See jay_common.js
	const _logTitle = 'login.router.get.verify'
	try {
		if (!req.cookies.passkey) {
			ws.web.resError(res, ws.cons.WARN_PASSKEY_NEEDED, 'Passkey needed.', _logTitle)
			return
		}
		const rst = await com.verifyToken(req.cookies.userid, req.cookies.token)
		if (rst.code != ws.cons.RESULT_OK) {
			ws.web.resError(res, rst.code, rst.msg, _logTitle)
			return
		}
		const rs = await loginProc(req, req.cookies.userid, null, req.cookies.passkey) //without pwd(null)
		if (rs.code != ws.cons.RESULT_OK) {
			ws.web.resError(res, rs.code, rs.msg, _logTitle)
			return
		}
		retJson(res, rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle, req.cookies.userid)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

router.get('/', async (req, res) => { //Manual Login
	const _logTitle = 'login.router.get'
	try {
		if (!req.query.pwd) {
			ws.web.resError(res, ws.cons.WARN_PASSWORD_NEEDED, 'Password needed.', _logTitle)
			return
		}
		const rs = await loginProc(req, req.query.userid, req.query.pwd, null) //with pwd
		if (rs.code != ws.cons.RESULT_OK) {
			ws.web.resError(res, rs.code, rs.msg, _logTitle)
			return
		}
		retJson(res, rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle, req.query.userid)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router