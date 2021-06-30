const config = require('../config')
const ws = require(config.app.ws)
const wsmysql = require(config.app.wsmysql)
const com = require('../common')
const express = require('express')
const router = express.Router()
//Inserting dummy data for organization tree and user on messenger. Process is as follows.
//1. Comment 3 lines (marked as ##) for the first time in order to insert dept data.
//2. Call https://sendjay.com/route/admin?type=insert_depts
//3. Uncomment 3 lines (marked as ##) in order to check the right user.
//4. Register ADMIN user (here 'hushsbay') and login
//5. Call https://sendjay.com/route/admin?type=insert_users
//메신저 트리에 표시될 조직도 및 사용자 dummy 데이터 추가하는 루틴입니다. insert 순서는 아래와 같습니다.
//1. 맨 처음에는 아래 ##표시된 3줄을 막고 
//2. https://sendjay.com/route/admin?type=insert_depts 호출
//3. ## 표시된 3줄을 다시 풀고 
//4. ADMIN 사용자 등록후 로그인 
//5. https://sendjay.com/route/admin?type=insert_users 호출

const proc = (req, res) => {
	const ADMIN = 'hushsbay', LAST_LEVEL = 3
	return new Promise(async (resolve, reject) => {
		let conn
		try {
			const result = await com.verifyWithRestUserId(req, res, null, 'admin') //##
			if (!result) resolve(rst) //##
			if (req.cookies.userid != ADMIN) throw new Error('This is a admin job.') //##
			let rs = ws.web.rsInit()
			conn = await wsmysql.getConnFromPool(global.pool)
			const _type = req.query.type
			if (_type == 'insert_depts') {
				let dqry = "DELETE FROM " + com.tbl.org + " WHERE ISUDT = '' "
				await wsmysql.query(conn, dqry, null)
				let iqry = "INSERT INTO " + com.tbl.org + " (ORG_CD, ORG_NM, LVL, SEQ) VALUES (?, ?, ?, ?) "
				const lvlArr = [0, 1, 2, 3, 3, 2, 3, 3, 1, 2, 3, 3, 2, 3, 3, 0, 1, 2, 3, 3, 2, 3, 3, 1, 2, 3, 3, 2, 3, 3]
				for (let i = 0; i < lvlArr.length; i++) {				
					const orgcd = i.toString().padStart(6, "0")
					const orgnm = i.toString().padStart(6, "0")
					const level = lvlArr[i]
					const seq = i.toString().padStart(6, "0")
					let prefix
					if (level == 0) {
						prefix = 'COMPANY_'
					} else if (level == 1) {
						prefix = 'HQ_'
					} else if (level == 2) {
						prefix = 'DEPT_'
					} else {
						prefix = 'TEAM_'  
					}
					await wsmysql.query(conn, iqry, [orgcd, prefix + orgnm, level, seq])
					console.log(i, "==> made", level, prefix + orgnm)
				}
			} else if (_type == 'insert_users') {
				qry = "SELECT ORG_CD, ORG_NM, LVL FROM " + com.tbl.org + " ORDER BY SEQ "		
				const data = await wsmysql.query(conn, qry, null)
				const _len = data.length
				if (_len == 0) throw new Error('No data in Z_ORG_TBL.')
				let dqry = "DELETE FROM " + com.tbl.user + " WHERE USER_ID LIKE 'user%' AND ISUDT = '' "
				await wsmysql.query(conn, dqry, null)
				let top_orgcd, top_orgnm, p = 0
				for (let i = 0; i < _len; i++) {
					const orgcd = data[i].ORG_CD
					const orgnm = data[i].ORG_NM
					const level = data[i].LVL
					if (level == 0) {
						top_orgcd = orgcd
						top_orgnm = orgnm
					} else {
						const k = level == LAST_LEVEL ? 3 : 1
						for (let j = 0; j < k; j++) {
							const _userid = 'user' + p.toString().padStart(3, "0")
							const _nicknm = 'Hi~'
							const _job = _userid.endsWith('1') ? 'job not described yet' : ''
							const _abcd = _userid.endsWith('2') ? 'biztrip' : _userid.endsWith('6') ? 'dayoff' : ''
							const _abnm = _userid.endsWith('3') || _userid.endsWith('6') ? 'mm/dd(Mon)~mm/dd(Fri)' : ''
							let iqry = "INSERT INTO " + com.tbl.user + " (USER_ID, PWD, USER_NM, ORG_CD, ORG_NM, TOP_ORG_CD, TOP_ORG_NM, NICK_NM, JOB, AB_CD, AB_NM) "
							iqry += "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
							await wsmysql.query(conn, iqry, [_userid, _userid, _userid, orgcd, orgnm, top_orgcd, top_orgnm, _nicknm, _job, _abcd, _abnm])
							p += 1
							console.log(p, "==> made", _userid)
						}
					}
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

router.get('/', async (req, res) => {
	const _logTitle = 'admin.router.get'
	try {
		const rs = await proc(req, res)
		res.json(rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle, req.query.uid)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router