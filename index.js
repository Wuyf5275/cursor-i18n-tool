#!/usr/bin/env node

/**
 * Cursor 汉化工具 — 入口文件
 * 
 * 执行逻辑 (防止 sudo-prompt + inquirer 死锁):
 * 
 *   1. 解析 process.argv，如果检测到 --action=translate 或 --action=restore
 *      → 直接静默执行对应操作，不启动 inquirer 菜单（提权后的子进程走这条路）
 *   
 *   2. 否则 → 展示 inquirer 交互菜单让用户选择操作
 *      → 检测是否有写入权限
 *        → 有权限：直接执行
 *        → 无权限：通过 sudo-prompt 以管理员身份重拉自身，追加 --action 参数
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const { detectCursorPath, hasWritePermission, elevateAndRun } = require('./src/platform');
const { translate, restore } = require('./src/i18n-core');

// ═══════════════════════════════════════════════
// 解析命令行参数
// ═══════════════════════════════════════════════

function parseAction() {
    const actionArg = process.argv.find(arg => arg.startsWith('--action='));
    if (!actionArg) return null;
    return actionArg.split('=')[1]; // 'translate' | 'restore'
}

// ═══════════════════════════════════════════════
// 静默模式（提权后的子进程入口）
// ═══════════════════════════════════════════════

async function runSilent(action) {
    const paths = detectCursorPath();
    if (!paths) {
        console.error('❌ 找不到 Cursor 安装目录！');
        process.exit(1);
    }

    if (action === 'translate') {
        translate(paths);
    } else if (action === 'restore') {
        restore(paths);
    } else {
        console.error(`❌ 未知操作: ${action}`);
        process.exit(1);
    }

    process.exit(0);
}

// ═══════════════════════════════════════════════
// 交互模式（用户双击/终端运行入口）
// ═══════════════════════════════════════════════

async function runInteractive() {
    console.log('');
    console.log(chalk.gray('  ┌──────────────────────────────────────┐'));
    console.log(chalk.gray('  │ ') + chalk.red('♥') + chalk.white(' ♠') + chalk.red(' ♦') + chalk.white(' ♣') + chalk.bold.white(' Cursor 一键汉化工具 ') + chalk.white('♣') + chalk.red(' ♦') + chalk.white(' ♠') + chalk.red(' ♥') + chalk.gray('  │'));
    console.log(chalk.gray('  │') + chalk.green.bold('      周四学习钉钉联系我 v1.0.0       ') + chalk.gray('│'));
    console.log(chalk.gray('  │') + chalk.gray('           作者: 不辞水         ') + chalk.gray('      │'));
    console.log(chalk.gray('  │') + chalk.yellow('     🂡 All in 完美汉化，梭哈！🂡  ') + chalk.gray('     │'));
    console.log(chalk.gray('  └──────────────────────────────────────┘'));
    console.log('');

    // 探测安装路径
    const paths = detectCursorPath();
    if (!paths) {
        console.log(chalk.red.bold('  ❌ 找不到 Cursor 安装目录！'));
        console.log(chalk.yellow('  请确认 Cursor 已安装在默认路径。'));
        console.log('');
        await waitForExit();
        return;
    }

    console.log(chalk.gray(`  📂 我抓到了你的鸡 Cursor: ${paths.appPath}`));
    console.log('');

    // 展示菜单
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: chalk.white.bold('请选择你的策略：'),
            choices: [
                { name: chalk.green('🚀  一键汉化 ———— 拿你价值'), value: 'translate' },
                { name: chalk.yellow('⏪ 恢复英文 ————— 我要验牌'), value: 'restore' },
                new inquirer.Separator(),
                { name: chalk.gray('❌ 下周四再见 ———— 小瘪三'), value: 'exit' },
            ],
        },
    ]);

    if (action === 'exit') {
        console.log(chalk.gray('\n  再见！👋'));
        return;
    }

    // 权限检测 → 决定直接执行还是提权
    const needElevation = !hasWritePermission(paths.mainJsPath);

    if (needElevation) {
        console.log('');
        console.log(chalk.yellow('  🔒 需要管理员权限才能修改 Cursor 核心文件。'));
        console.log(chalk.yellow('  ⏳ 正在请求提权，请在弹出的系统提示中确认...'));
        console.log('');

        try {
            await elevateAndRun(action);
            console.log('');
            console.log(chalk.green.bold('  ✅ 操作已在管理员权限下完成！'));
        } catch (e) {
            console.log('');
            console.log(chalk.red.bold('  ❌ 提权失败或用户取消: ') + chalk.red(e.message));
        }
    } else {
        // 有权限，直接执行
        if (action === 'translate') {
            translate(paths);
        } else {
            restore(paths);
        }
    }

    console.log('');
    await waitForExit();
}

/**
 * 等待用户按任意键退出（给双击运行的用户看结果的机会）
 */
async function waitForExit() {
    // pkg 打包后双击运行时，让用户看到结果后再关闭窗口
    if (process.stdout.isTTY) {
        await inquirer.prompt([
            {
                type: 'input',
                name: 'exit',
                message: chalk.gray('按 Enter 键退出...'),
            },
        ]);
    }
}

// ═══════════════════════════════════════════════
// 入口拦截：优先判断是否为静默模式
// ═══════════════════════════════════════════════

const silentAction = parseAction();
if (silentAction) {
    // 提权后的子进程 → 直接执行，不启动菜单
    runSilent(silentAction);
} else {
    // 正常启动 → 交互菜单
    runInteractive().catch(err => {
        console.error(chalk.red('❌ 发生未预料的错误: ') + err.message);
        process.exit(1);
    });
}
