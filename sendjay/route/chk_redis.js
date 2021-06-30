const config = require('../config')
const ws = require(config.app.ws)
const com = require('../common')
const express = require('express')
const router = express.Router()
//security level (high) : User can access only one's own data.

const proc = (req) => {
	return new Promise(async (resolve, reject) => {
		try {
			let rs = ws.web.rsInit()
			const _type = req.query.type
			const _userkey = req.query.userkey
			const _winid = req.query.winid //winid is important only for embeded web messenger and nothing for else.
			const pattern = com.cons.key_str_winid + _userkey + com.cons.easydeli //eg) $$W__USERID;
			const uwKey = pattern + _winid //eg) $$WW__USERID;20200918210554260
			const stream = global.store.scanStream({ match : pattern + '*', count : com.cons.scan_stream_cnt }) //console.log(_type, _userkey, _winid, pattern, uwKey)
			if (_type == "chk_embeded") { //Last check for web messenger's auto-launch. 웹메신저 자동실행을 위한 마지막 체크임.
				stream.on('data', async (resultKeys) => { //resultKeys is an array of strings representing key names
					const _dt = ws.util.getCurDateTimeStr(true)
					if (resultKeys.length == 0) { //console.log(_type, _userkey, _winid, pattern, uwKey, "====new")
						await global.store.set(uwKey, _dt)
						rs.result = "new" //New winner. 새로운 winner.	
					} else {
						for (let item of resultKeys) {
							const arr = item.split(com.cons.easydeli) //[0](userkey), [1](winid)
							if (arr[1] == _winid) { //console.log(_type, _userkey, _winid, pattern, uwKey, "====same")
								await global.store.set(uwKey, _dt)
								rs.result = "same" //Former winner continued. 기존 우승자 계속. 
								break
							} else { //console.log(_type, _userkey, _winid, pattern, uwKey, "====another")
								//Elapsed more than com.cons.max_diff_sec_worker seconds has to be deleted since it is garbage data which is not being updated by web worker.
								//com.cons.max_diff_sec_worker가 지난 것은 닫힌 탭이므로 삭제해야 함 (Web Worker에 의해 업데이트 안되는 가비지 데이터임)
								const _dtVal = await global.store.get(item)
								const _diffSec = ws.util.getDateTimeDiff(_dtVal, new Date())
								if (_diffSec > com.cons.max_diff_sec_worker) await global.store.del(item)
								rs.result = "another"
							}
						}
					}
					rs.userip = req.clientIp
					resolve(rs)
				})
			} else if (_type == "set_new") { //Key set when manual launch. manual 실행시 무조건 키 setting함. 
				stream.on('data', async (resultKeys) => {
					for (let item of resultKeys) await global.store.del(item)
					await global.store.set(uwKey, _winid) //console.log(_type, _userkey, _winid, pattern, uwKey)
					rs.result = "new" //New winner. 새로운 winner.		
					rs.userip = req.clientIp
					resolve(rs)
				})
			} //stream.on('end', function() { resolve(rs) }) //'end' does not guarantee rs.result as defined.
		} catch (ex) {
			reject(ex)
		}
	})
}

router.get('/', async (req, res) => {
	const _logTitle = 'chk_redis.router.get'
	try {
		const arr = req.query.userkey.split(com.cons.keydeli)
		const useridToCompare = arr.length == 0 ? arr[0] : arr[1] //In fact, arr.length == 0 means error
		const result = await com.verifyWithRestUserId(req, res, useridToCompare, _logTitle)
		if (!result) return
		const rs = await proc(req)
		res.json(rs)
	} catch (ex) {
		ws.log.ex(req, ex, _logTitle)
		ws.web.resError(res, ws.cons.RESULT_ERR, ex.message, _logTitle)
	}
})

module.exports = router