const com = require('../common')
//ioredis with sub.psubscribe() : not socket-io-redis
//message is transfered to specific nodejs (socket) server and processed inside that server.
//특정 nodejs(socket서버)로 전달된 메시지로 그 서버내에서 처리.

module.exports = async (pattern, channel, message) => {
	
	const _chan = channel.replace(com.cons.prefix, '') //console.log(pattern, channel, message) = $$S, $$disconnect_prev_sock, {"prevkey" ~}
	const _logTitle = _chan
	const obj = JSON.parse(message) //{"prevkey":"$$SD__q;/sendjay#fNVceK6CERrueMCpAAAC","socketid":"/sendjay#7psRJ_F6lf6_FB6nAAAA",~}

	try {
		if (_chan == 'disconnect_prev_sock') { 
			//adapter.remoteDisconnect not used since a lot of work to do when make other socket disconnect.
			//adapter.remoteDisconnect 사용하지 않음 : 아래 코딩처럼 처리할 내용이 있어서 그대로 사용하기로 함
			const prevsocketid = obj.prevkey.split(com.cons.easydeli)[1]
			const prevSocket = global.jay.sockets.get(prevsocketid)
			if (prevSocket) { //Previous socket for current userkey exists in this server. 해당서버에 이전 소켓이 있으므로 연결 끊기.
				if (prevSocket.userkey.startsWith(com.cons.m_key)) { //Mobile App
					if (prevSocket.userip != obj.userip) { //obj.userip might be undefined when it comes from worker01.js
						const param = { ev : com.cons.sock_ev_cut_mobile, data : { userid : prevSocket.userid }, returnTo : "parent" }
						prevSocket.emit(com.cons.sock_ev_common, param) //emit to client directly
						//com.procWarn(null, prevSocket, _logTitle, 'telling previous Mobile socket to finish ChatService =>', prevsocketid, obj.userkey)
						//Sometimes, 'connect -> connect -> disconnect(ping timeout)' occurs on same device and not figured out yet (async).
						//But prevSocket.emit(cut_mobile) not executed which should be executed. 
						//1) After setting forceNew (socket connect option) to false, it never happens. I don't understand why forceNew affects this problem
						//   because forceNew is concerned with socket instance and here in sendjay project instance is only one 
						//   so I don't think it matters whether forceNew is true or false.
						//2) In addition, 'if userip != ~' clause added for preventing problem. 
						//가끔, 'connect - connect - disconnect(ping timeout)' 문제가 발생하며 아직 원인파악이 안됨 (async).
						//그런데 여기서 emit되어야 할 prevSocket.emit(cut_mobile)은 emit되지 않음. 
						//1) socket connect option인 forceNew를 false로 변경한 후엔 발생하지 않고는 있으나
						//   sendjay가 소켓 인스턴스 한개만 사용하므로 forceNew는 상관없다고 생각하였는데 이해는 안되는 상태임.
						//2) 추가로, if userip 비교 넣어서 문제발생 안되도록 함.
					}
				} else { //PC Web
					prevSocket.prev = true //If true when disconnected, sock_ev_show_off will not be emitted. prevSocket은 true로 해야 disconnect시 sock_ev_show_off emit하지 않음.
					prevSocket.disconnect() //When disconnected, com.multiDelForUserkeySocket() executed in disconnect.js. redis데이터처리는 disconnect.js에서 담당.
					//com.procWarn(null, prevSocket, _logTitle, 'telling previous Web socket to disconnect =>', prevsocketid, obj.userkey)
				}
			} else { //com.procWarn(null, null, _logTitle, 'no socket in this server =>', prevsocketid, obj.userkey)
				await com.multiDelGarbageForUserkeySocket(obj.prevkey, true) //processed on every socket server
			}
		} else if (_chan == 'sendto_myother_socket') { //from read_msg.js
			const othersocketid = obj.otherkey.split(com.cons.easydeli)[1]
			const otherSocket = global.jay.sockets.get(othersocketid)
			if (otherSocket) otherSocket.emit(com.cons.sock_ev_common, obj.param)
		}
	} catch (ex) {
		const curSocket = global.jay.sockets.get(obj.socketid)
		if (curSocket) com.procWarn(com.cons.sock_ev_toast, curSocket, _logTitle, ex) //only to socket server who published this message
	}

}
