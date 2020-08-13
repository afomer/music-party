const io = require('socket.io')();
let usersIDs = {}
let politeness_tuples = {}

// When a new connetion is fired store it's id in memory
io.on('connection', (socket) => {
    let new_id = 0
    while(Object.keys(usersIDs).includes(String(new_id))) {
        new_id = Math.ceil(Math.random() * 1000)
    }
    usersIDs[new_id] = socket
    socket.id = new_id

    console.log('[JOIN] ', socket.id)

    socket.on('message', ({to, data}) => {
        console.log(to, !!data, data)
        if (usersIDs[to]) {
            const peer_from  = socket.id;
            const peer_to = to
            let peers_id = [peer_from, peer_to]
            peers_id.sort()

            if (!politeness_tuples[peers_id]) {
                politeness_tuples[peers_id] = {
                    [peer_from]: false,
                    [peer_to]: true
                }
            }

            usersIDs[to].emit('message', {
                "from": peer_from,
                "data": data,
                "polite": politeness_tuples[peers_id][peer_from]
            })

            console.log(`[${peer_from}] => [${peer_to}]`)
        } else {
            // Tell the user the other peer is not available
            const peer_from  = socket.id;
            const peer_to = to

            socket.emit('disconnected', {
                "id": peer_to,
            })
        }
    })

    socket.on('join', ({ to, data }) => {
        console.log('join: ', to, data.description)
        if (usersIDs[to]) {
            usersIDs[to].emit('listener', {
                "from": socket.id,
                "description": data.description
            })
        }


    })

    socket.on('disconnect', () => {
        usersIDs[socket.id] = null
    })

    socket.emit('init', {'id': new_id})

});


io.listen(3000);