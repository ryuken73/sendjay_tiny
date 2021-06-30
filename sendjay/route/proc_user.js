const config = require('../config')
const nodeConfig = require(config.app.nodeConfig)
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const express = require('express')
const router = express.Router()
//security level (high) : User can access only one's own data. (except 'new' mode)

const chkMemCount = async (orgcd, orgnm, conn) => { //This is temporary coding to restrict selecting node
	const qry = "SELECT COUNT(*) CNT FROM " + com.tbl.user + " WHERE ORG_CD = ? AND DEL_DATE = '' "
	const data = await wsmysql.query(conn, qry, [orgcd])
	if (data.length == null || data[0].CNT < com.cons.max_member_for_org) return ''
	return 'Members are already full. Please select other node. (' + orgnm + '/' + orgcd + ')'
}

const proc = (req) => {
	return new Promise(async (resolve, reject) => {
		let conn
		const MAX = 3
		const qry1 = "SELECT ORG_CD, ORG_NM FROM " + com.tbl.org + " WHERE SEQ < (SELECT SEQ FROM " + com.tbl.org + " WHERE ORG_CD = ?) AND LVL = 0 ORDER BY SEQ DESC LIMIT 0, 1 "
		try {
			let rs = ws.web.rsInit()		
			conn = await wsmysql.getConnFromPool(global.pool)
			const _mode = req.body.mode
			const _userid = req.body.userid			
			const qry = "SELECT COUNT(*) CNT FROM " + com.tbl.user + " WHERE USER_ID = ? AND DEL_DATE = '' "
			const data = await wsmysql.query(conn, qry, [_userid])
			if (_mode == 'new') {
				if (data[0].CNT > 0) {
					rs.code = ws.cons.RESULT_ERR
					rs.msg = 'User ID (' + _userid + ') already exists. Use another one.'
				} else {
					const _usernm = decodeURIComponent(req.body.usernm)
					const _pwd = req.body.pwd			
					const _enc = ws.util.encrypt(_pwd, nodeConfig.crypto.key)
					const _orgcd = req.body.orgcd
					const _orgnm = req.body.orgnm
					const data1 = await wsmysql.query(conn, qry1, [_orgcd])
					const passkey = ws.util.getRnd().toString() 
					const ip = req.clientIp
					const _chk = await chkMemCount(_orgcd, _orgnm, conn)
					if (_chk) throw new Error(_chk)
					const role = await com.getRole(req.cookies.userid, conn) //req.cookies.userid might be undefined if user not logined
					if (!com.chkRole(role, com.cons.group_ay) && !com.chkRole(role, com.cons.group_main)) {
						const sqry = "SELECT COUNT(*) CNT FROM " + com.tbl.user + " WHERE UID = ? AND DEL_DATE = '' "
						const data_s = await wsmysql.query(conn, sqry, [ip])
						if (data_s[0].CNT > MAX)  throw new Error('Sorry for inconvenience. You can register only ' + MAX + ' user with this IP address (' + ip + ') due to server capacity.')
					}
					const iqry = "INSERT INTO " + com.tbl.user + " (USER_ID, PWD, PASSKEY, USER_NM, ORG_CD, ORG_NM, TOP_ORG_CD, TOP_ORG_NM, UID, ISUR, ISUDT) " + 
								 "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, sysdate(6)) "
					await wsmysql.query(conn, iqry, [_userid, _enc, passkey, _usernm, _orgcd, _orgnm, data1[0].ORG_CD, data1[0].ORG_NM, ip, _userid])
				}
			} else if (_mode == 'modify' || _mode == 'delete') {
				if (data[0].CNT == 0) {
					rs.code = ws.cons.RESULT_ERR
					rs.msg = 'User ID (' + _userid + ') not exists.'
				} else if (_mode == 'delete') {
					const dqry = "DELETE FROM " + com.tbl.user + " WHERE USER_ID = ? AND DEL_DATE = '' "
					await wsmysql.query(conn, dqry, [_userid])
				} else {
					const _usernm = decodeURIComponent(req.body.usernm)
					const _orgcd = req.body.orgcd
					const _orgnm = req.body.orgnm
					const _chk = await chkMemCount(_orgcd, _orgnm, conn)
					if (_chk) throw new Error(_chk)
					const data1 = await wsmysql.query(conn, qry1, [_orgcd])
					if (req.body.pwd) {
						const _pwd = req.body.pwd	
						const _enc = ws.util.encrypt(_pwd, nodeConfig.crypto.key)	
						const uqry = "UPDATE " + com.tbl.user + " SET PWD = ?, USER_NM = ?, ORG_CD = ?, ORG_NM = ?, TOP_ORG_CD = ?, TOP_ORG_NM = ?, MODR = ?, MODDT = sysdate(6) " +
									 "WHERE USER_ID = ? AND DEL_DATE = '' "
						await wsmysql.query(conn, uqry, [_enc, _usernm, _orgcd, _orgnm, data1[0].ORG_CD, data1[0].ORG_NM, _userid, _userid])
					} else {
						const uqry = "UPDATE " + com.tbl.user + " SET USER_NM = ?, ORG_CD = ?, ORG_NM = ?, TOP_ORG_CD = ?, TOP_ORG_NM = ?, MODR = ?, MODDT = sysdate(6) " + 
									 "WHERE USER_ID = ? AND DEL_DATE = '' "
						await wsmysql.query(conn, uqry, [_usernm, _orgcd, _orgnm, data1[0].ORG_CD, data1[0].ORG_NM, _userid, _userid])
					}
				}
			} else if (_mode == 'passkey') { //See btn_reset_auth in erp_portal.html and also login.js.
				if (data[0].CNT == 0) {
					rs.code = ws.cons.RESULT_ERR
					rs.msg = 'User ID (' + _userid + ') not exists.'
				} else {
					const passkey = ws.util.getRnd().toString() //This sql does not let others use auto-login without changing their password (including other web browser). 
					const uqry = "UPDATE " + com.tbl.user + " SET PASSKEY = ? WHERE USER_ID = ? AND DEL_DATE = '' "
					await wsmysql.query(conn, uqry, [passkey, _userid])
				}
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
	const _logTitle = 'proc_user.router.post'
	try {
		if (req.body.mode != 'new') {
			const result = await com.verifyWithRestUserId(req, res, null, _logTitle)
			if (!result) return
		}
		const rs = await proc(req)
		res.json(rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle, req.body.userid) //Userid might be new one without cookies.
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router
