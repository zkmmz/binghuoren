# 共生边界 · 冰火人

使用摄像头手势或键盘控制的双角色合作闯关小游戏，包含三个递进关卡。

## 操作

- 摄像头预览左边的手控制冰人，右边的手控制火人。
- 在各自半边画面内左右移动手掌控制位置；食指朝上跳跃；在机关旁持续握拳，为另一侧架桥。
- 键盘：冰人 A / D 移动、W 跳跃、S 充能；火人方向键左右移动、上跳跃、下充能。
- 收集每侧 3 枚晶石，双方机关充满后进入出口。触碰检查点后，失误会从检查点复活并保留进度。

## 本地检查

需要 Node.js 20 或更新版本，无需安装依赖。

```sh
npm test
npm run build
```

通过本地静态服务器打开项目，或部署到 HTTPS 网站后游玩。摄像头需要浏览器授权。
手部识别库、模型和字体需要网络访问；可随时使用键盘模式。

## 从 GitHub 部署到 Cloudflare Pages

1. Cloudflare 控制台 → Workers & Pages → 创建 Pages 项目 → 导入 Git 仓库。
2. 连接 GitHub，选择 `zkmmz/binghuoren`。
3. 生产分支选择 `main`，框架预设选择 `None`。
4. 构建命令填 `npm run build`，构建输出目录填 `dist`，根目录留空。
5. 保存并部署，完成后使用 Cloudflare 提供的 HTTPS 地址访问游戏。

连接成功后，每次推送到 `main` 都会触发自动部署。

官方参考：[静态 HTML 部署](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)、[GitHub 集成](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)。
