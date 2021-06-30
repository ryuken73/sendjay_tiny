const config = require('../config')
const ws = require(config.app.ws)
const express = require('express')
const router = express.Router()
const ogs = require('open-graph-scraper') //https://balmostory.tistory.com/50
//security level (low) : Every user can access all data.

const proc = (req) => {
	return new Promise(async (resolve, reject) => {
		let conn
		try {
			let rs = ws.web.rsInit()
			let _ret = { msgid : req.query.msgid, url : req.query.url, ogImg : '', ogTitle : '', ogDesc : '' }
			const option = { url : req.query.url, timeout : 5000, encoding : 'utf-8', followAllRedirects : true, maxRedirects : 5, blacklist : [ ] }
			ogs(option, function (error, result) {
				if (error) { //true. The error it self is inside the results object.
					rs.result = _ret			
					resolve(rs)
				} else {  
					try {
						_ret.ogImg = result.ogImage.url
						_ret.ogTitle = result.ogTitle
						_ret.ogDesc = result.ogDescription
						rs.result = _ret	
					} catch (ex) {
					} finally {
						rs.result = _ret
						resolve(rs)
					}
				}
			})	
		} catch (ex) {
			reject(ex)
		} finally {
			try { if (conn) wsmysql.closeConn(conn) } catch(ex) { }
		}
	})
}

router.get('/', async (req, res) => {
	const _logTitle = 'get_opengraph.router.get'
	try {
		const rs = await proc(req)
		res.json(rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router