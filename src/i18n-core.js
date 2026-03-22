/**
 * 核心汉化逻辑 + Hash 修复 + Mac Gatekeeper 修复
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { safeGlobalDict, riskyShortWords } = require('./dict');
const { PLATFORM } = require('./platform');

// 辅助：转义正则特殊字符
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ═══════════════════════════════════════════════
// 预编译正则（模块加载时一次性构建，后续复用）
// ═══════════════════════════════════════════════

// 安全长句：按长度降序排列，确保长句优先匹配
const safeEntries = Object.entries(safeGlobalDict).sort((a, b) => b[0].length - a[0].length);
const safePattern = safeEntries.map(([en]) => escapeRegExp(en)).join('|');

// 单次大正则：匹配被引号包裹的安全长句
const safeMegaRegex = new RegExp(`(["'\`])(${safePattern})\\1`, 'g');

// 长句裸文本正则（>=20 字符，不会与代码变量冲突）
const longEntries = safeEntries.filter(([en]) => en.length >= 20);
const longPattern = longEntries.map(([en]) => escapeRegExp(en)).join('|');
const longMegaRegex = longPattern ? new RegExp(`(${longPattern})`, 'g') : null;

// 危险短词的 UI 属性列表
const uiProps = ['children', 'title', 'label', 'placeholder', 'description', 'tooltip', 'text'];
const uiPropsPattern = uiProps.join('|');

// 为每个危险短词预编译 3 种正则
const riskyRegexes = Object.entries(riskyShortWords).map(([en, zh]) => {
    const escaped = escapeRegExp(en);
    return {
        en, zh,
        // UI 属性赋值: children: "General"
        propRegex: new RegExp(`(${uiPropsPattern})\\s*:\\s*(["'\`])(${escaped})\\2`, 'g'),
        // JSX 文本节点: React.createElement("div", null, "General")
        jsxRegex: new RegExp(`(null|}|\\w)\\s*,\\s*(["'\`])(${escaped})\\2\\s*(?=[,)])`, 'g'),
        // HTML 标签内文本: >General<
        htmlRegex: new RegExp(`>\\s*(${escaped})\\s*<`, 'g'),
    };
});


// ═══════════════════════════════════════════════
// 备份与还原
// ═══════════════════════════════════════════════

function backupFile(filePath) {
    const backupPath = filePath + '.backup';
    if (fs.existsSync(backupPath)) {
        // 已有备份 → 从备份还原到干净状态
        fs.copyFileSync(backupPath, filePath);
        return '🧹 已还原干净的原版文件 ———— 正在洗牌';
    } else if (fs.existsSync(filePath)) {
        // 首次运行 → 创建备份
        fs.copyFileSync(filePath, backupPath);
        return '💾 已备份纯净原版文件 ———— 正在洗牌';
    }
    return null;
}

function restoreFromBackup(filePath) {
    const backupPath = filePath + '.backup';
    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
        return true;
    }
    return false;
}


// ═══════════════════════════════════════════════
// Hash 修复
// ═══════════════════════════════════════════════

function detectHashAlgo(hash) {
    const len = hash.length;
    if (len <= 24) return 'md5';
    if (len <= 44) return 'sha256';
    if (len <= 88) return 'sha512';
    return 'sha256';
}

function fixProductHash(mainJsPath, productJsonPath) {
    const updatedContent = fs.readFileSync(mainJsPath);
    const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
    let hashUpdated = false;

    if (productJson.checksums) {
        for (const key in productJson.checksums) {
            if (key.endsWith('workbench.desktop.main.js')) {
                const oldHash = productJson.checksums[key];
                const algo = detectHashAlgo(oldHash);
                const newHash = crypto.createHash(algo)
                    .update(updatedContent)
                    .digest('base64')
                    .replace(/=+$/, '');
                productJson.checksums[key] = newHash;
                hashUpdated = true;
                break;
            }
        }
    }

    if (hashUpdated) {
        fs.writeFileSync(productJsonPath, JSON.stringify(productJson, null, '\t'), 'utf8');
    }
    return hashUpdated;
}


// ═══════════════════════════════════════════════
// Mac Gatekeeper 修复
// ═══════════════════════════════════════════════

function fixMacGatekeeper(appPath) {
    if (PLATFORM !== 'darwin') return;

    // 往上找到 .app 目录
    const appBundlePath = appPath.split('/Contents/')[0];
    if (!appBundlePath || !appBundlePath.endsWith('.app')) return;

    console.log('🍎 正在修复 macOS Gatekeeper 签名...');

    // 1. 清除隔离属性
    try {
        execSync(`xattr -cr "${appBundlePath}"`, { stdio: 'pipe' });
        console.log('  ✅ 已清除隔离属性 (xattr -cr)');
    } catch (e) {
        console.log('  ⚠️ 清除隔离属性失败: ' + e.message);
    }

    // 2. 重签名（容错：用户可能未安装 Xcode 命令行工具）
    try {
        execSync(`codesign --force --deep --sign - "${appBundlePath}"`, { stdio: 'pipe' });
        console.log('  ✅ 已完成本地重签名 (codesign)');
    } catch (e) {
        console.log('  ⚠️ codesign 重签名失败（可能未安装 Xcode 命令行工具），不影响使用: ' + e.message);
    }
}


// ═══════════════════════════════════════════════
// 核心汉化
// ═══════════════════════════════════════════════

/**
 * 执行汉化
 * @param {{ appPath: string, mainJsPath: string, htmlPath: string, productJsonPath: string }} paths
 */
function translate(paths) {
    const { appPath, mainJsPath, htmlPath, productJsonPath } = paths;

    // 1. 备份
    console.log('');
    const msgs = [
        backupFile(htmlPath),
        backupFile(mainJsPath),
        backupFile(productJsonPath),
    ].filter(Boolean);
    msgs.forEach(m => console.log(`  ${m}`));

    // 2. 读取核心 JS
    console.log('\n⚙️  正在读取并处理核心代码...');
    let jsContent = fs.readFileSync(mainJsPath, 'utf8');

    const jokes = [
        "诺导指着满屏红字问蜗牛，蜗牛说这是给代码加的除夕皮肤。",
        "蓉蓉问苗苗这Bug怎么复现，苗苗推了推眼镜：“看缘分。”",
        "发总发了个大红包，海洋只抢到一分钱，表示要加班到天亮。",
        "杨书记开会抓摸鱼，结果前排的木木文已经抱着抱枕睡熟了。",
        "帅气飞对电脑深情发誓，只要不报错什么都行。系统弹了俩Warning。",
        "海洋写了个邮件自动回复，结果和木木文的脚本硬核对聊了一整夜。",
        "发总夸蓉蓉看电脑的眼神很专注，蓉蓉弱弱说：“发总，电脑死机了。”",
        "苗苗和帅气飞打赌修Bug，杨书记路过重启了服务器，Bug全没了。",
        "蜗牛把删库脚本交了上去，诺导看后连夜买站票逃离了这座城市。",
        "海洋跟发总申请买双屏，说是为了左边摸鱼右边看代码更高效。",
        "帅气飞把bug说成“不影响使用的特性”，被木木文追着打了三条街。",
        "蓉蓉以为自己写了个完美递归，结果把杨书记的机器终于跑死机了。",
        "苗苗的注释写得比代码还长，诺导看了直呼好一篇长篇短篇小说。",
        "发总问大家进度如何，蜗牛指着屏幕：“在建文件夹了，很快！”",
        "木木文声称自己掌握了面向运气编程，只要不报错那就是成功。",
        "诺导让海洋优化内存，海洋直接把功能删了：不运行就不会占内存。",
        "蓉蓉给变量起名a1、a2，帅气飞看源码时差点当场超度上西天了。",
        "杨书记提议大家早睡早起，凌晨三点发现苗苗还在偷偷提交代码。",
        "发总视察打卡记录，惊觉蜗牛为了改Bug已经连续三天睡在公司了。",
        "木木文的代码像是一杯意面上全是结，诺导顺着找Bug找进医院了。",
        "帅气飞用玄学修好了Bug，别人问怎么弄的，他说：“重启治百病。”",
        "蓉蓉发现了一个严重的漏洞，海洋看了一眼说：“没事，那叫彩蛋。”",
        "苗苗问蜗牛借个键盘，蜗牛拿出一个所有键位都被磨平的无字天书。",
        "杨书记为了团建让大家提建议，木木文建议大家周末一起熬夜改Bug。",
        "诺导试图理解帅气飞的代码逻辑链路，最终大脑CPU过载直接冒烟了。",
        "发总给大家发年终奖，海洋一打开，里面是一张“明年继续努力”的贺卡。",
        "蜗牛把测试环境配崩了无故触发警报，蓉蓉以为停电可以提前下班了。",
        "木木文的屏幕倒转过来看代码，声称是为了转换一下思考问题的角度。",
        "帅气飞写的接口延迟高达10秒，他解释说这叫“让用户有一点期待感”。",
        "苗苗一行代码解决核心问题，杨书记拍手叫绝，结果发现连的是测试库。"
    ];
    let lastJokeTime = Date.now();
    // 洗牌函数（Fisher-Yates）
    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    let shuffledJokes = shuffleArray([...jokes]);
    let jokeIndex = 0;
    function printJoke() {
        const now = Date.now();
        if (now - lastJokeTime > 3000) {
            if (jokeIndex >= shuffledJokes.length) {
                shuffledJokes = shuffleArray([...jokes]);
                jokeIndex = 0;
            }
            // 将文本限制在较短的范围，防止终端因为宽度不够自动换行产生多行
            process.stdout.write(`\r\x1b[K  📢 摸鱼小剧场: ${shuffledJokes[jokeIndex]}`);
            jokeIndex++;
            lastJokeTime = now;
        }
    }

    // 3. 安全长句：单次大正则替换
    jsContent = jsContent.replace(safeMegaRegex, (match, quote, en) => {
        printJoke();
        return `${quote}${safeGlobalDict[en]}${quote}`;
    });

    // 4. 长句裸文本替换
    if (longMegaRegex) {
        jsContent = jsContent.replace(longMegaRegex, (match, en) => {
            printJoke();
            return safeGlobalDict[en];
        });
    }

    process.stdout.write('\n'); // 换行保留最后一句笑话

    // 5. 含内嵌引号和特殊Unicode转义的词条
    // 5. 暴力正则破译：处理带标点、特殊转义、单双引号混用的顽固长句
    console.log('  🔍 正在处理包含特殊符号的顽固词条...');
    const trickyReplacements = [
        {
            // 攻克 1：Reset "Don't Ask Again" Dialogs 
            // 魔法解析：(?:'|\\'|\\u2019|’|&#39;) 涵盖了前端所有的单引号变体，(?:\\?["']|\\u0022|&quot;) 兼容所有双引号变体
            regex: /Reset\s+(?:\\?["']|\\u201[CD]|\\u0022|&quot;)Don(?:'|\\'|\\u2019|’|&#39;)t\s+Ask\s+Again(?:\\?["']|\\u201[CD]|\\u0022|&quot;)\s+Dialogs/gi,
            zh: '重置“不再询问”弹窗'
        },
        {
            // 攻克 2：See warnings and tips that you've hidden
            regex: /See\s+warnings\s+and\s+tips\s+that\s+you(?:'|\\'|\\u2019|’|&#39;)ve\s+hidden/gi,
            zh: '查看您已隐藏的警告和提示'
        },
        {
            // 攻克 3：No Hidden Dialogs Yet
            regex: /No\s+Hidden\s+Dialogs\s+Yet/gi,
            zh: '暂无隐藏的弹窗'
        },
        {
            // 攻克 4：You haven't marked any dialogs as "Don't ask again"...
            regex: /You\s+haven(?:'|\\'|\\u2019|’|&#39;)t\s+marked\s+any\s+dialogs\s+as\s+(?:\\?["']|\\u201[CD]|\\u0022|&quot;)Don(?:'|\\'|\\u2019|’|&#39;)t\s+ask\s+again(?:\\?["']|\\u201[CD]|\\u0022|&quot;)\.\s*Any\s+hidden\s+dialogs\s+will\s+appear\s+here\s+to\s+manage\./gi,
            zh: '您尚未将任何弹窗标记为“不再询问”。任何隐藏的弹窗都将显示在此处以供管理。'
        },
        {
            // 攻克 5：截图2 的软链接超长警告
            // 魔法解析：them 和 Changing 之间可能有 ${...} 条件表达式（团队管理员控制标记）
            regex: /Use\s+with\s+caution\.\s*Skip\s+symlinks\s+during\s+\.cursorignore\s+file\s+discovery\.\s*Only\s+enable\s+if\s+your\s+repository\s+has\s+many\s+symlinks\s+and\s+all\s+\.cursorignore\s+files\s+are\s+reachable\s+without\s+them(?:\$\{[^}]*\}[^C]*)?\.\s*Changing\s+this\s+setting\s+will\s+require\s+a\s+restart\s+of\s+Cursor\./gi,
            zh: '请谨慎使用。在查找 .cursorignore 文件时跳过符号链接。仅当代码库包含大量符号链接且均可直接访问时才启用。更改此设置需重启 Cursor。'
        },
        {
            // 攻克 6a：label:`Submit with ${Fs?"⌘ + ":"Ctrl + "}Enter`
            regex: /Submit\s+with\s+(\$\{[^}]+\}|Ctrl\s*\+\s*)Enter/gi,
            zh: '使用 $1Enter 提交'
        },
        {
            // 攻克 6b：description:`When enabled, ${Fs?"⌘ + ":"Ctrl + "}Enter submits chat and Enter inserts a newline`
            regex: /When\s+enabled,\s+(\$\{[^}]+\}|Ctrl\s*\+\s*)Enter\s+submits\s+chat\s+and\s+Enter\s+inserts\s+a\s+newline/gi,
            zh: '启用后，$1Enter 提交聊天，Enter 插入换行'
        },
        {
            // 攻克 7：Apply .cursorignore files to all subdirectories...
            regex: /Apply\s+(.{0,10}?)\.cursorignore(.{0,10}?)\s+files\s+to\s+all\s+subdirectories(?:\$\{[^}]*\}[^C]*)?\.\s*Changing\s+this\s+setting\s+will\s+require\s+a\s+restart\s+of\s+Cursor\./gi,
            zh: '将 $1.cursorignore$2 文件应用于所有子目录。更改此设置需重启 Cursor。'
        },
        {
            // 攻克 10：Automatically import necessary modules for ${r}
            // 实际文件中是模板字符串，TypeScript/C++ 通过变量 ${r} 注入
            regex: /Automatically\s+import\s+necessary\s+modules\s+for\s+(\$\{[^}]+\}|TypeScript|C\+\+)/gi,
            zh: '自动为 $1 导入必要的模块'
        },
        {
            // 攻克 10.5：Accept the next word of a suggestion via ${...}
            // 实际文件中快捷键是通过 keybindingService 动态获取的变量
            regex: /Accept\s+the\s+next\s+word\s+of\s+a\s+suggestion\s+via\s+(\$\{[^}]+\}|Ctrl\+RightArrow)/gi,
            zh: '使用 $1 接受建议的下一个词'
        },
        {
            // 攻克 11：Embed codebase for improved contextual understanding and knowledge...
            regex: /Embed\s+codebase\s+for\s+improved\s+contextual\s+understanding\s+and\s+knowledge\.\s*Embeddings\s+and\s+metadata\s+are\s+stored\s+in\s+the\s+([^,]{1,50}?),\s*but\s+all\s+code\s+is\s+stored\s+locally\./gi,
            zh: '嵌入代码库以提升上下文理解和知识运用。嵌入向量和元数据存储在$1中，但所有代码均存储在本地。'
        },
        {
            // 攻克 13：Files to exclude from indexing in addition to .gitignore.
            regex: /Files\s+to\s+exclude\s+from\s+indexing\s+in\s+addition\s+to\s+([\s\S]{0,10}?)\.gitignore([\s\S]{0,10}?)\./gi,
            zh: '除 $1.gitignore$2 外要从索引中排除的额外文件。'
        },
        {
            // 攻克 14：Add documentation to use as context...
            regex: /Add\s+documentation\s+to\s+use\s+as\s+context\.\s*You\s+can\s+also\s+use\s+([\s\S]{0,20}?)@Add([\s\S]{0,20}?)\s+in\s+Chat\s+or\s+while\s+editing\s+to\s+add\s+a\s+doc\./gi,
            zh: '添加文档以用作上下文。您也可以在聊天或编辑框中使用 $1@Add$2 来添加文档。'
        },
        {
            // 攻克 15：You're over your current usage limit...
            regex: /You(?:'|\\'|\\u2019|’|&#39;)re\s+over\s+your\s+current\s+usage\s+limit\s+and\s+your\s+requests\s+are\s+being\s+processed\s+with\s+(.{1,20}?)\s+in\s+the\s+slow\s+queue\./gi,
            zh: '您已超出当前使用额度，您的请求正在慢速队列中由 $1 处理。'
        },
        {
            // 攻克 16：Automatically parse links when pasted into Quick Edit (${Fs?"⌘":"Ctrl+"}K) input
            // 实际文件中快捷键部分是三元表达式动态生成
            regex: /Automatically\s+parse\s+links\s+when\s+pasted\s+into\s+Quick\s+Edit\s+\((\$\{[^}]+\}|Ctrl\+)K\)\s+input/gi,
            zh: '粘贴到快速编辑 ($1K) 输入框时自动解析链接'
        },
        {
            // 攻克 17：Automatically jump to the next diff when accepting changes with ${Fs?"⌘":"Ctrl+"}Y
            regex: /Automatically\s+jump\s+to\s+the\s+next\s+diff\s+when\s+accepting\s+changes\s+with\s+(\$\{[^}]+\}|Ctrl\+)Y/gi,
            zh: '使用 $1Y 接受更改时自动跳转到下一个差异'
        },
        {
            // 攻克 18：Show a hint for ${Fs?"⌘":"Ctrl+"}K in the Terminal
            regex: /Show\s+a\s+hint\s+for\s+(\$\{[^}]+\}|Ctrl\+)K\s+in\s+the\s+Terminal/gi,
            zh: '在终端中显示 $1K 提示'
        },
        {
            // 攻克 19：Preview Box for Terminal ${Fs?"⌘":"Ctrl+"}K
            regex: /Preview\s+Box\s+for\s+Terminal\s+(\$\{[^}]+\}|Ctrl\+)K/gi,
            zh: '终端 $1K 的预览框'
        },
        {
            // 攻克 20：Automatically index any new folders with fewer than 250,000 files
            // 实际代码是一个数组：["Automatically index any new folders with fewer than"," ",Ui(()=>...)," ","files"]
            regex: /\[\s*"Automatically\s+index\s+any\s+new\s+folders\s+with\s+fewer\s+than"\s*,\s*" "\s*,\s*(.+?)\s*,\s*" "\s*,\s*"files"\s*\]/gi,
            zh: '["自动索引文件数量少于", " ", $1, " ", "个的新文件夹"]'
        },
        {
            // 攻克 21：Automatically index repositories to speed up Grep searches. All data is stored locally.
            regex: /"Automatically\s+index\s+repositories\s+to\s+speed\s+up\s+Grep\s+searches\.\s+All\s+data\s+is\s+stored\s+locally\."/gi,
            zh: '"自动索引代码库以加速 Grep 搜索。所有数据均存储在本地。"'
        }
    ];

    trickyReplacements.forEach(({ regex, zh }) => {
        printJoke();
        jsContent = jsContent.replace(regex, zh);
    });
    // jsContent = jsContent.split('"Reset \\"Don\'t Ask Again\\" Dialogs"').join('"重置\\"不再询问\\"弹窗"');
    // jsContent = jsContent.split("'Reset \"Don\\'t Ask Again\" Dialogs'").join("'重置\"不再询问\"弹窗'");
    // jsContent = jsContent.split('label:\'Reset "Don\\u2019t Ask Again" Dialogs\'').join('label:\'重置“不再询问”弹窗\'');
    // jsContent = jsContent.split('description:"See warnings and tips that you\\u2019ve hidden"').join('description:"查看您已隐藏的警告和提示"');
    // jsContent = jsContent.split('title:"No Hidden Dialogs Yet"').join('title:"暂无隐藏的弹窗"');
    // jsContent = jsContent.split('description:\'You haven\\u2019t marked any dialogs as "Don\\u2019t ask again". Any hidden dialogs will appear here to manage.\'').join('description:\'您尚未将任何弹窗标记为“不再询问”。任何隐藏的弹窗都将显示在此处以供管理。\'');

    // 6. 危险短词：精准 UI 属性替换
    for (const { zh, propRegex, jsxRegex, htmlRegex } of riskyRegexes) {
        printJoke();
        jsContent = jsContent.replace(propRegex, `$1: $2${zh}$2`);
        jsContent = jsContent.replace(jsxRegex, `$1, $2${zh}$2`);
        jsContent = jsContent.replace(htmlRegex, `>${zh}<`);
    }

    process.stdout.write('\n'); // 收尾换行

    // 7. 写回
    fs.writeFileSync(mainJsPath, jsContent, 'utf8');
    console.log('✅ 核心 JS 文件智能汉化完成！');

    // 8. 修复 Hash
    console.log('\n🛠️  正在重新计算指纹并修复文件完整性...');
    const hashFixed = fixProductHash(mainJsPath, productJsonPath);
    if (hashFixed) {
        console.log('✅ 已更新 product.json 校验值，消除「安装已损坏」警告。');
    } else {
        console.log('⚠️  未找到对应的校验项，可能无需更新。');
    }

    // 9. Mac Gatekeeper 修复
    fixMacGatekeeper(appPath);

    console.log('\n🎉 汉化完成！请重启 Cursor 查看中文设置页。');
}


/**
 * 恢复英文原版
 * @param {{ mainJsPath: string, htmlPath: string, productJsonPath: string }} paths
 */
function restore(paths) {
    const { mainJsPath, htmlPath, productJsonPath } = paths;

    console.log('');
    let restored = 0;
    for (const filePath of [htmlPath, mainJsPath, productJsonPath]) {
        if (restoreFromBackup(filePath)) {
            console.log(`  ✅ 已还原: ${path.basename(filePath)}`);
            restored++;
        }
    }

    if (restored > 0) {
        console.log('\n🎉 已恢复英文原版！请重启 Cursor 生效。');
    } else {
        console.log('\n⚠️  未找到备份文件，无法还原。请确认之前是否执行过汉化。');
    }
}

module.exports = { translate, restore };