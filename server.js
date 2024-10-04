const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// 确保 files 文件夹存在
const uploadDir = path.join(__dirname, 'files');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 设置 multer 存储配置
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 中间件：解析请求体
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(uploadDir));
app.use('/js', express.static(path.join(__dirname, 'js'))); // 配置 js 目录外部访问

// 列出文件
app.get('/', (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) return res.status(500).send('无法读取文件夹');

        const fileListHtml = files.map(file => `<li><a href="${file}" download>${file}</a></li>`).join('');
        res.send(`
            <!DOCTYPE html>
            <html lang="zh">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>文件上传</title>
                <script src="/js/resumable.js"></script>
            </head>
            <body>
                <h1>文件列表</h1>
                <ul>${fileListHtml}</ul>
                
                <h2>上传文件</h2>
                <input type="file" id="fileInput" required>
                
                <div id="progressContainer" style="display: none;">
                    <progress id="uploadProgress" value="0" max="100"></progress>
                    <span id="progressText"></span>
                </div>
                
                <script>
                    const r = new Resumable({
                        target: '/upload',
                        chunkSize: 10 * 1024 * 1024, // 10MB
                        simultaneousUploads: 1,
                        testChunks: true,
                        throttleProgressCallbacks: 1,
                        query: { filename: '' } // 初始化 filename
                    });

                    r.assignBrowse(document.getElementById('fileInput'));
                    
                    r.on('fileAdded', (file) => {
                        const fileName = file.fileName; // 获取文件名
                        r.opts.query.filename = fileName; // 更新 query 中的 filename

                        fetch('/check-file', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ filename: fileName })
                        }).then(response => {
                            if (!response.ok) {
                                throw new Error('文件已存在，不能上传同名文件。');
                            }
                            r.upload(); // 开始上传
                        }).catch(error => {
                            alert(error.message);
                        });
                    });

                    r.on('progress', () => {
                        const percentComplete = r.progress() * 100;
                        document.getElementById('uploadProgress').value = percentComplete;
                        document.getElementById('progressText').textContent = '上传进度: ' + Math.round(percentComplete) + '%';
                        document.getElementById('progressContainer').style.display = 'block';
                    });

                    r.on('complete', () => {
                        alert('文件上传成功');
                        location.reload();
                    });

                    r.on('error', (message) => {
                        alert('上传失败: ' + message);
                    });
                </script>
            </body>
            </html>
        `);
    });
});

// 检查文件是否存在
app.post('/check-file', (req, res) => {
    const { filename } = req.body;
    const filePath = path.join(uploadDir, filename);
    
    if (fs.existsSync(filePath)) {
        return res.status(400).send('文件已存在，不能上传同名文件。');
    }
    res.send('文件名可用');
});

// 上传文件
app.post('/upload', upload.single('file'), (req, res) => {
    const tempFilePath = path.join(uploadDir, `${req.body.filename}.part`); // 临时文件名

    // 追加文件内容
    fs.writeFileSync(tempFilePath, req.file.buffer, { flag: 'a' }); 

    // 检查是否为最后一个分片
    if (req.body.isLastChunk) {
        const finalFilePath = path.join(uploadDir, req.body.filename);
        fs.renameSync(tempFilePath, finalFilePath); // 重命名文件
    }

    res.send('文件上传成功');
});

// 处理上传错误
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).send(err.message); // 返回 multer 错误
    }
    if (err) {
        return res.status(500).send(err.message); // 返回其他错误
    }
    next();
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`服务器在 http://0.0.0.0:${PORT} 上运行`);
});
