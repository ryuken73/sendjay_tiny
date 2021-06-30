const config = require('../config')
const ws = require(config.app.ws)
const com = require('../common')
const express = require('express')
const router = express.Router()
 //See removeCache in jay_common.js (client) => for html only for now.

router.use((req, res, next) => {
	req.qsStr = ws.web.getQueryStringWithNoCache(req, com.cons.nocache)
	next()
})

router.get('/jay/:name', async (req, res) => {
	if (!req.params.name.includes('.')) res.redirect('./' + req.params.name + '.html' + req.qsStr)
}) //ex) https://sendjay.com/jay/?launch=manual&winid=20210519162435 excluded

router.get('/:name', async (req, res) => { //favicon.ico too
	if (!req.params.name.includes('.')) res.redirect('./' + req.params.name + '.html' + req.qsStr)
})

router.get('/', async (req, res) => {
	res.redirect('./portal.html' + req.qsStr)
})

module.exports = router
