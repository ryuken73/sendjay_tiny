module.exports = {
	http : {
		method : process.env.HTTP_METHOD,
		port : process.env.HTTP_PORT
	},
	sock : {
		port : process.env.SOCK_PORT,	
		namespace : process.env.SOCK_NAMESPACE		
	},
	mysql : {
		schema : process.env.MYSQL_SCHEMA
	},
	redis : {
		db : process.env.REDIS_DB,
		flush : process.env.REDIS_FLUSH_SERVER 
	},
	push : {
		fcm_key_file : process.env.FCM_KEY_FILE
	},
	app : {
		nodeConfig : process.env.NODE_CONFIG,
		ws : process.env.MODULE_COMMON,
		wsmysql : process.env.MODULE_MYSQL,
		logPath : process.env.LOG_PATH,
		uploadPath : process.env.UPLOAD_PATH,
		corsRestful : ['https://xyz.com'], //Array type. It's ok even if same origin not here
		corsSocket : 'https://sendjay.com', //Non-array type. Same origin should be here
		ffmpeg : 'C:/ffmpeg/bin/ffmpeg.exe'
	}
}
