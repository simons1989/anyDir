const http = require('http')
const conf = require('./config/defaultConfig')
const chalk = require('chalk')
const path = require('path')
const fs = require('fs')
const Handlebars = require('handlebars')
const mime = require('./helper/mime')
const compress = require('./helper/compress')
const range = require('./helper/range')
const isFresh = require('./helper/cache')

const tplPath = path.join(__dirname, '../src/template/dir.tpl')
const source = fs.readFileSync(tplPath, 'utf-8')
const template = Handlebars.compile(source)

class Server {
    constructor(config) {
        this.conf = Object.assign({}, conf, config)
    }
    start() {
        const server = http.createServer((req, res) => {
            const filePath = path.join(this.conf.root, req.url)
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    res.statusCode = 404
                    res.setHeader('Content-Type', 'text/plain')
                    res.end(`${filePath} is not a directory or file`)
                    return
                }
                if (stats.isFile()) {
                    const contentType = mime(filePath)
                    res.statusCode = 200
                    res.setHeader('Content-Type', contentType)
                    if (isFresh(stats, req, res)) {
                        res.statusCode = 304
                        res.end()
                        return
                    }
                    let rs
                    const { code, start, end } = range(stats.size, req, res)
                    if (code === 200) {
                        res.statusCode = 200
                        rs = fs.createReadStream(filePath)
                    } else {
                        res.statusCode = 206
                        rs = fs.createReadStream(filePath, { start, end })
                    }

                    if (filePath.match(this.conf.compress)) {
                        rs = compress(rs, req, res)
                    }
                    rs.pipe(res)
                } else if (stats.isDirectory()) {
                    fs.readdir(filePath, (err, files) => {
                        res.statusCode = 200
                        res.setHeader('Content-Type', 'text/html')
                        const dir = path.relative(this.conf.root, filePath)
                        const data = {
                            title: path.basename(filePath),
                            dir: dir ? `/${dir}` : '',
                            files: files.map(file => {
                                return {
                                    file: file,
                                    icon: mime(file)
                                }
                            })
                        }
                        res.end(template(data))
                    })
                }
            })
        })

        server.listen(this.conf.port, this.conf.hostname, () => {
            const addr = `http://${this.conf.hostname}:${this.conf.port}`
            console.info(`Server started at ${chalk.green(addr)}`)
        })
    }
}
module.exports = Server