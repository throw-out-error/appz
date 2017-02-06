const fs = require('fs')
const path = require('path')
const cpuCount = require('os').cpus().length
const cluster = require('cluster')
const mkdirp = require('mkdirp')

const Worker = require('./../class/Worker')
const log = require('./log')

const NOEND = {
  end: false
}


module.exports = function startWorkers(dir, pack) {
  return new Promise((resolve, reject) => {
    verify(pack)

    if(pack.name === 'z1') {
      throw new Error('the name "z1" is invalid')
    }

    const out = log.get(dir)

    // output path
    let output = null
    if(typeof pack.output === 'string') {
      if(path.isAbsolute(pack.output)) {
        output = pack.output
      } else {
        output = path.join(dir, pack.output)
      }
    } else {
      output = path.join(process.env.HOME, '.z1', pack.name)
    }

    const workerCount = Math.abs(+pack.workers) || cpuCount

    const e = []
    const q = []
    const n = []

    // create output dir
    n.push(new Promise((resolve, reject) => {
      mkdirp(output, err => {
        if(err && err.code !== 'EEXIST') {
          reject(err)
          return
        }

        log.setup(pack.name, output)

        resolve()
      })
    }))

    // setup master
    cluster.setupMaster({
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    })

    const oldWd = process.cwd()
    process.chdir(dir)

    const ENV = {
      PWD: dir
    }

    for(let i = 0; i < workerCount; i++) {
      let worker = new Worker(dir, pack.main, pack.name, pack.ports, ENV)
      let w = worker.w
      w.process.stdout.pipe(out.log, NOEND)
      w.process.stderr.pipe(out.err, NOEND)

      w.on('error', handle)

      e.push(worker.once('exit').then(code => {
        throw new Error(`worker of app "${pack.name}" not started (exit code: ${code})`)
      }))
      q.push(worker.once('available'))
    }

    process.chdir(oldWd)

    // when all workers are online before an error
    e.push(Promise.all(q))
    n.push(Promise.race(e))

    Promise.all(n).then(() => {
      resolve({
        app: pack.name,
        dir: dir,
        started: workerCount,
        ports: pack.ports
      })
    }).catch(err => {
      reject(err)
    })
  })
}

function verify(pack) {

  // name
  if(!pack.name) {
    throw new Error('name in package.json must be set')
  }

  // ports
  if(!Array.isArray(pack.ports)) {
    throw new Error('ports in package.json must be an array')
  }

  if(!pack.ports.length) {
    throw new Error('ports in package.json must contain at least one port')
  }

  const valid = pack.ports.filter(p => typeof p === 'number')

  if(valid.length !== pack.ports.length) {
    throw new Error('ports in package.json must (only) contain numbers')
  }
}
