const config = require('./config')
const nodeConfig = require(config.app.nodeConfig)
const mysql = require('mysql')

module.exports = (function() {

	let wsmysql = {

		createPool : (_scheme, _verbose) => {
			const mysqloption = nodeConfig.mysql[config.app.mysql_dbinst]
			const mysqluser = mysqloption[config.app.mysql_user]	
			if (_verbose) {
				console.log('mysql', config.app.mysql_dbinst, mysqloption.host, mysqloption.port, mysqluser.user, mysqluser.pwd, _scheme, mysqloption.poolsize)
			} else {
				console.log('mysql pool created')
			}
		 	return mysql.createPool({ host: mysqloption.host, port: mysqloption.port, user: mysqluser.user, password: mysqluser.pwd, database: _scheme, 
		 							  connectionLimit: mysqloption.poolsize, queueLimit: 0, waitForConnections: true, dateStrings : 'date' })
		} 

		,getConnFromPool : (pool) => new Promise((resolve, reject) => {
			if (pool) {
				pool.getConnection(function(err, conn) {				
					if (err) { 
						reject(err)
					} else {
						resolve(conn)
					}
				})
			} else {
				reject(new Error('wsmysql.getConnFromPool : No Pool'))
			}
		})

		,query : (conn, sql, param) => new Promise((resolve, reject) => {
			if (conn) {
				conn.query(sql, param, function(err, data) {
					if (err) { 
						reject(err)
					} else {
						resolve(data)
					}
				})
			} else {
				reject(new Error('wsmysql.query : No Conn'))
			}
		})

		,txBegin : (conn) => new Promise((resolve, reject) => {
			if (conn) {
				conn.beginTransaction(function(err) {				
					if (err) { 
						reject(err)
					} else {
						resolve()
					}
				})
			} else {
				reject(new Error('wsmysql.txBegin : No Conn'))
			}
		})

		,txCommit : (conn) => new Promise((resolve, reject) => {  
			if (conn) {
				conn.commit(function(err) {				
					if (err) { 
						conn.rollback(function() {
							reject(err)
						})					
					} else {
						resolve()
					}
				})
			} else {
				reject(new Error('wsmysql.txCommit : No Conn'))
			}
		})

		,txRollback : (conn) => new Promise((resolve, reject) => {
			if (conn) {
				conn.rollback(function(err) {
					if (err) {
						reject(err)
					} else {
						resolve()
					}
				})
			} else {
				reject(new Error('wsmysql.txRollback : No Conn'))
			}
		})

		,closeConn : (conn) => {
			if (conn) {
				try { 
					conn.release()
				} catch (ex) {}
			}
		}

	}

	return wsmysql

})()
