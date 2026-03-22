/**
 * 跨平台路径探测与智能提权模块
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const sudo = require('sudo-prompt');

const PLATFORM = os.platform(); // 'win32' | 'darwin'

/**
 * 探测 Cursor 安装路径，返回 app 目录
 * @returns {{ appPath: string, mainJsPath: string, htmlPath: string, productJsonPath: string } | null}
 */
function detectCursorPath() {
    let candidates = [];

    if (PLATFORM === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        candidates = [
            path.join(localAppData, 'Programs', 'cursor', 'resources', 'app'),
            path.join(programFiles, 'cursor', 'resources', 'app'),
        ];
    } else if (PLATFORM === 'darwin') {
        candidates = [
            '/Applications/Cursor.app/Contents/Resources/app',
            path.join(os.homedir(), 'Applications', 'Cursor.app', 'Contents', 'Resources', 'app'),
        ];
    } else {
        return null;
    }

    const appPath = candidates.find(p => fs.existsSync(p));
    if (!appPath) return null;

    return {
        appPath,
        mainJsPath: path.join(appPath, 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
        htmlPath: path.join(appPath, 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'),
        productJsonPath: path.join(appPath, 'product.json'),
    };
}

/**
 * 检测目标文件是否有写入权限
 * @param {string} filePath
 * @returns {boolean}
 */
function hasWritePermission(filePath) {
    try {
        fs.accessSync(filePath, fs.constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * 以管理员权限重新拉起自身进程（静默模式，不再启动 inquirer）
 * 
 * 核心设计：追加 --action 参数，让提权后的子进程直接执行对应操作，
 * 绝不渲染 inquirer 菜单，避免无 TTY 环境下的进程死锁。
 * 
 * @param {'translate' | 'restore'} action
 * @returns {Promise<void>}
 */
function elevateAndRun(action) {
    return new Promise((resolve, reject) => {
        // 判断当前是 pkg 打包后的可执行文件 还是 node 源码运行
        const isPkg = typeof process.pkg !== 'undefined';
        let command;

        if (isPkg) {
            // pkg 打包后：process.execPath 就是可执行文件本身
            command = `"${process.execPath}" --action=${action}`;
        } else {
            // 源码运行：node index.js --action=translate
            const entryScript = path.resolve(__dirname, '..', 'index.js');
            command = `"${process.execPath}" "${entryScript}" --action=${action}`;
        }

        const options = {
            name: 'Cursor 汉化工具',
        };

        sudo.exec(command, options, (error, stdout, stderr) => {
            if (error) {
                reject(error);
                return;
            }
            // 将子进程的输出透传到当前控制台
            if (stdout) process.stdout.write(stdout);
            if (stderr) process.stderr.write(stderr);
            resolve();
        });
    });
}

module.exports = {
    PLATFORM,
    detectCursorPath,
    hasWritePermission,
    elevateAndRun,
};
