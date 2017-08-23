const cluster = require('cluster')
const { BetterEvents } = require('better-events')
const path = require('path')

/** @type {{string: Worker}} */
const workers = {}
/** @type {Worker[]} */
const workerList = []

/**
 * Class representing a worker process.
 * @class
 * @extends BetterEvents
 */
class Worker extends BetterEvents {
  /**
   * Create a new Worker instance.
   * @param {string} dir - Directory of the worker.
   * @param {string} file - Main file of the worker.
   * @param {string} name - Name of the app.
   * @param {number[]} ports - Ports that the worker listens to.
   * @param {{string: string}} env - Environment variables for the worker.
   */
  constructor(dir, file, name, ports, env) {
    super()

    this.dir = dir
    this.file = file
    this.name = name // needed to kill workers without app
    this.ports = ports
    this.state = Worker.PENDING

    // change cwd
    const owd = process.cwd()
    process.chdir(dir)

    cluster.setupMaster({
      exec: path.join(dir, file)
    })

    // fork new worker
    const w = cluster.fork(env)
    this.id = w.id

    // restore cwd
    process.chdir(owd)

    // add to workers
    workers[this.id] = this
    workerList.push(this)

    w.on('error', err => Worker.errorHandler(err))

    w.once('exit', (code, signal) => {
      // remove from workers
      delete workers[this.id]
      // it can not happen that the worker is not in the workerList
      workerList.splice(workerList.indexOf(this), 1)

      this.emit('exit', code, signal)
    })

    const available = () => {
      if (this.state < Worker.AVAILABLE) {
        this.state = Worker.AVAILABLE
        this.emit('available')
      }
    }

    if (ports.length) {
      const portQueue = ports.slice()

      const listening = (address) => {
        const i = portQueue.indexOf(address.port)
        if (i !== -1) {
          portQueue.splice(i, 1)
        }

        if (!portQueue.length) {
          this.removeListener('listening', listening)
          available()
        }
      }

      w.on('listening', listening)
    }

    w.on('message', message => {
      if (message === 'ready') {
        available()
      }
    })
  }

  /**
   * Kill the worker process.
   * @param {string} [signal] - Kill signal (Default: SIGTERM).
   * @param {*} time - Time until force-kill.
   * @returns {boolean} - Returns true if the worker process is still connected.
   */
  kill(signal = 'SIGTERM', time) {
    this.state = Worker.KILLED

    const w = this.w

    if (!w || !w.isConnected()) {
      return false
    }

    w.disconnect()

    if (typeof time === 'number') {
      const timeout = setTimeout(() => {
        if (w.isConnected()) {
          w.kill(signal)
        }
      }, time)
      w.once('exit', () => {
        clearTimeout(timeout)
      })
    }

    return true
  }

  get w() {
    return cluster.workers[this.id]
  }

  static get workers() {
    return workers
  }

  static get workerList() {
    return workerList
  }

  static errorHandler(err) {
    console.error(err)
  }
}

Worker.PENDING = 0
Worker.AVAILABLE = 1
Worker.KILLED = 2
Worker.states = ['PENDING', 'AVAILABLE', 'KILLED']

module.exports = Worker
