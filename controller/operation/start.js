const path = require('path')
const fs = require('fs')
const cluster = require('cluster')

const Worker = require('./../class/Worker')
const testPackage = require('./../snippet/testPackage')
const Tube = require('./../class/Tube')
const formatDate = require('./../snippet/formatDate')

const cpuCount = require('os').cpus().length
const dir = require('./../module/init').dir

const hour = 1000 * 60 * 60

const stdio = {}

const noEnd = {
  end: false
}

/*
command: start {
  dir // absolute path to dir
}
*/

module.exports = function start(config, command) {

  return new Promise((resolve, reject) => {

    if(!global.isResurrected) {
      config.apps = []
      global.isResurrected = true
    }

    if(!path.isAbsolute(command.dir)) {
      throw new Error('command.dir must be an absolute path')
    }

    //test if path exists
    fs.readdirSync(command.dir)

    // read config file
    const packPath = require.resolve(path.join(command.dir, 'package.json'))
    if(require.cache[packPath]) {
      delete require.cache[packPath]
    }
    const pack = require(packPath)

    // test if config file includes
    // name, ports, main
    testPackage(pack)

    if(config) {

      // check if already started
      if(config.apps.includes(command.dir)) {
        throw new Error(`app "${pack.name}" (${command.dir}) already started.`)
      }

      // check if name is already taken
      checkName(pack.name)

      config.apps.push(command.dir)
    }

    // resolve (& create) output path
    let output = null
    if(pack.output) {
      if(path.isAbsolute(pack.output)) {
        output = pack.output
      } else {
        output = path.join(command.dir, pack.output)
      }
    } else {
      output = path.join(dir, pack.name)
    }

    try {
      fs.mkdirSync(output)
    } catch(err) {
      if(err.code !== 'EEXIST') {
        throw err
      }
    }

    // create output streams
    if(stdio[command.dir]) {
      if(stdio[command.dir].output !== output) {
        // output was edited => reconnect
        stdio[command.dir].output = output
        connect(stdio[command.dir])
      }
    } else {
      stdio[command.dir] = {
        output: output,
        stdout: new Tube(),
        stderr: new Tube(),
        currentOut: null,
        currentErr: null
      }
      connect(stdio[command.dir])

      stdio[command.dir].interval = setInterval(connect, hour, stdio[command.dir])
    }

    // setup master

    cluster.setupMaster({
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    })

    const q = []
    const r = []

    const k = +pack.workers || cpuCount
    console.log(`start app "${pack.name}" with ${k} workers`)

    for(let i = 0; i < k; i++) {
      fork()
    }

    function fork() {
      const file = path.basename(pack.main)
      const worker = new Worker(command.dir, file, pack.name, pack.ports)
      const w = worker.w

      w.process.stdout.pipe(stdio[command.dir].stdout, noEnd)
      w.process.stderr.pipe(stdio[command.dir].stderr, noEnd)

      worker.once('exit', (code, sig) => {
        if(code && !sig) {
          // start again, when crashed
          fork()
        }
      })

      q.push(worker.once('available'))
      r.push(worker.once('exit'))
    }

    Promise.race(r).then(() => {
      reject(new Error('unable to start'))
    })
    Promise.all(q).then(() => {
      resolve({
        app: pack.name,
        dir: command.dir,
        started: k
      })
    })
  })
}

function checkName(name) {
  const r = Worker.workerList.filter(w => w.name === name)
  if(r.length) {
    throw new Error(`name already used for another app (${r[0].dir})`)
  }
}

function connect(stdio) {
  if(stdio.currentOut || stdio.currentErr) {
    stdio.stdout.unpipe(stdio.currentOut)
    stdio.stderr.unpipe(stdio.currentErr)
  }

  //create new streams
  const date = formatDate()
  const outFile = path.join(stdio.output, `log-${date}.txt`)
  const errFile = path.join(stdio.output, `err-${date}.txt`)
  stdio.currentOut = fs.createWriteStream(outFile)
  stdio.currentErr = fs.createWriteStream(errFile)

  stdio.stdout.pipe(stdio.currentOut)
  stdio.stderr.pipe(stdio.currentErr)
}
