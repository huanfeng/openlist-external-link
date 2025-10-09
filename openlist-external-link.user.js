// ==UserScript==
// @name         OpenList 外网链接增强
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  为 OpenList 右键菜单添加复制外网链接功能
// @author       You
// @match        http*://*.develop.server/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 调试开关 - 设置为 true 开启详细日志
    const DEBUG = false;

    // 日志工具函数
    const logger = {
        log: (...args) => DEBUG && console.log(...args),
        warn: (...args) => DEBUG && console.warn(...args),
        error: (...args) => console.error(...args), // 错误日志始终显示
        init: (...args) => console.log(...args) // 初始化日志始终显示
    };

    // 配置管理
    class ConfigManager {
        constructor() {
            this.configKey = 'openlist_domain_mappings';
        }

        // 获取域名映射配置
        getDomainMappings() {
            const config = GM_getValue(this.configKey, '[]');
            return JSON.parse(config);
        }

        // 保存域名映射配置
        saveDomainMappings(mappings) {
            GM_setValue(this.configKey, JSON.stringify(mappings));
        }

        // 添加域名映射
        addMapping(internalDomain, externalDomain) {
            const mappings = this.getDomainMappings();
            const newMapping = {
                id: Date.now().toString(),
                internalDomain: internalDomain.trim(),
                externalDomain: externalDomain.trim(),
                enabled: true
            };
            mappings.push(newMapping);
            this.saveDomainMappings(mappings);
            return newMapping;
        }

        // 删除域名映射
        removeMapping(id) {
            const mappings = this.getDomainMappings();
            const filtered = mappings.filter(m => m.id !== id);
            this.saveDomainMappings(filtered);
        }

        // 更新域名映射
        updateMapping(id, internalDomain, externalDomain, enabled = true) {
            const mappings = this.getDomainMappings();
            const mapping = mappings.find(m => m.id === id);
            if (mapping) {
                mapping.internalDomain = internalDomain.trim();
                mapping.externalDomain = externalDomain.trim();
                mapping.enabled = enabled;
                this.saveDomainMappings(mappings);
            }
        }
    }

    // URL转换器
    class UrlConverter {
        constructor(configManager) {
            this.configManager = configManager;
        }

        // 将内网URL转换为外网URL
        convertToExternalUrl(internalUrl) {
            const mappings = this.configManager.getDomainMappings();

            for (const mapping of mappings) {
                if (mapping.enabled && internalUrl.startsWith(mapping.internalDomain)) {
                    return internalUrl.replace(mapping.internalDomain, mapping.externalDomain);
                }
            }

            return internalUrl; // 如果没有匹配的映射，返回原始URL
        }

        // 检查是否有可用的域名映射
        hasAvailableMappings() {
            const mappings = this.configManager.getDomainMappings();
            return mappings.some(m => m.enabled);
        }
    }

    // 菜单增强器
    class MenuEnhancer {
        constructor(configManager, urlConverter) {
            this.configManager = configManager;
            this.urlConverter = urlConverter;
            this.currentFileUrl = '';
            this.currentFileElement = null;
            this.menuObserver = null;
        }

        // 初始化
        init() {
            logger.init('[OpenList外网链接] MenuEnhancer 初始化开始');
            this.setupContextMenuListener();
            this.observeMenuChanges();
            logger.init('[OpenList外网链接] 右键菜单监听器已设置');
            this.addConfigButton();
            logger.init('[OpenList外网链接] 配置按钮已添加');
        }

        // 监听右键点击，记录被点击的文件元素
        setupContextMenuListener() {
            document.addEventListener('contextmenu', (e) => {
                // 查找被右键点击的文件项
                const fileItem = e.target.closest('.list-item');
                if (fileItem) {
                    this.currentFileElement = fileItem;
                    const href = fileItem.getAttribute('href');
                    logger.log('[OpenList外网链接] 右键点击文件:', href);
                }
            }, true);
        }

        // 监听右键菜单的出现
        observeMenuChanges() {
            this.menuObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const contextMenu = node.querySelector('.solid-contextmenu') ||
                                              (node.classList && node.classList.contains('solid-contextmenu') ? node : null);

                            if (contextMenu) {
                                logger.log('[OpenList外网链接] 检测到右键菜单出现');
                                this.enhanceContextMenu(contextMenu);
                            }
                        }
                    });
                });
            });

            this.menuObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
            logger.log('[OpenList外网链接] MutationObserver 已开始监听 body');
        }

        // 增强右键菜单
        enhanceContextMenu(contextMenu) {
            logger.log('[OpenList外网链接] 开始增强右键菜单');

            // 查找"复制链接"菜单项
            const copyLinkItem = this.findCopyLinkItem(contextMenu);
            if (!copyLinkItem) {
                logger.log('[OpenList外网链接] 未找到"复制链接"菜单项');
                return;
            }
            logger.log('[OpenList外网链接] 找到"复制链接"菜单项');

            // 检查是否已经添加过外网链接菜单项
            if (contextMenu.querySelector('.external-link-item')) {
                logger.log('[OpenList外网链接] 已存在外网链接菜单项，跳过');
                return;
            }

            // 直接从文件元素获取链接
            this.getCurrentFileUrl();

            // 创建"复制外网链接"菜单项
            const externalLinkItem = this.createExternalLinkMenuItem();

            // 在"复制链接"项后插入
            copyLinkItem.parentNode.insertBefore(externalLinkItem, copyLinkItem.nextSibling);
            logger.log('[OpenList外网链接] 已添加"复制外网链接"菜单项');
        }

        // 查找"复制链接"菜单项
        findCopyLinkItem(contextMenu) {
            const items = contextMenu.querySelectorAll('.solid-contextmenu__item');
            for (const item of items) {
                const text = item.querySelector('p');
                if (text && text.textContent.trim() === '复制链接') {
                    return item;
                }
            }
            return null;
        }

        // 从文件元素直接获取URL
        getCurrentFileUrl() {
            logger.log('[OpenList外网链接] 尝试获取文件链接');

            if (!this.currentFileElement) {
                logger.warn('[OpenList外网链接] 没有记录到文件元素');
                this.currentFileUrl = window.location.href;
                return;
            }

            // 从文件项的 href 属性获取路径
            const href = this.currentFileElement.getAttribute('href');
            if (href) {
                // 构建完整的下载链接
                // OpenList 的下载链接格式是: http://domain/d/path
                const origin = window.location.origin;
                this.currentFileUrl = `${origin}/d${href}`;
                logger.log('[OpenList外网链接] 成功获取文件链接:', this.currentFileUrl);
            } else {
                logger.warn('[OpenList外网链接] 文件元素没有 href 属性');
                this.currentFileUrl = window.location.href;
            }
        }

        // 创建"复制外网链接"菜单项
        createExternalLinkMenuItem() {
            const menuItem = document.createElement('div');
            menuItem.className = 'solid-contextmenu__item external-link-item';

            const isAvailable = this.urlConverter.hasAvailableMappings();

            menuItem.innerHTML = `
                <div class="solid-contextmenu__item__content">
                    <div class="hope-stack hope-c-dhzjXW hope-c-PJLV hope-c-PJLV-ihVlqVC-css">
                        <svg stroke-width="2" color="currentColor" viewBox="0 0 24 24" stroke="currentColor" fill="none"
                             stroke-linecap="round" stroke-linejoin="round"
                             class="hope-icon hope-c-XNyZK hope-c-PJLV hope-c-PJLV-idbpawf-css"
                             height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M9 15l6 -6"></path>
                            <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"></path>
                            <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"></path>
                            <circle cx="12" cy="12" r="1" fill="currentColor"></circle>
                        </svg>
                        <p class="hope-text hope-c-PJLV hope-c-PJLV hope-c-PJLV-ijhzIfm-css"
                           style="${!isAvailable ? 'opacity: 0.5;' : ''}">
                            复制外网链接${!isAvailable ? ' (未配置)' : ''}
                        </p>
                    </div>
                </div>
            `;

            // 添加点击事件
            menuItem.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleExternalLinkCopy();
            });

            return menuItem;
        }

        // 处理复制外网链接
        handleExternalLinkCopy() {
            if (!this.urlConverter.hasAvailableMappings()) {
                alert('请先配置域名映射！');
                this.showConfigDialog();
                return;
            }

            logger.log('[OpenList外网链接] 处理复制外网链接, currentFileUrl:', this.currentFileUrl);

            if (this.currentFileUrl) {
                const externalUrl = this.urlConverter.convertToExternalUrl(this.currentFileUrl);
                logger.log('[OpenList外网链接] 转换后的外网URL:', externalUrl);

                // 使用降级方案复制（因为 clipboard API 可能不可用）
                this.fallbackCopyToClipboard(externalUrl);

                // 关闭右键菜单
                this.closeContextMenu();
            } else {
                alert('无法获取文件链接，请重试');
            }
        }

        // 关闭右键菜单
        closeContextMenu() {
            const contextMenu = document.querySelector('.solid-contextmenu');
            if (contextMenu) {
                // 移除菜单元素
                contextMenu.remove();
                logger.log('[OpenList外网链接] 已关闭右键菜单');
            }
        }

        // 降级复制方案
        fallbackCopyToClipboard(text) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showNotification('外网链接已复制到剪贴板');
        }

        // 显示通知
        showNotification(message) {
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4caf50;
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                z-index: 10000;
                font-size: 14px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            `;
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => {
                document.body.removeChild(notification);
            }, 3000);
        }

        // 添加配置按钮
        addConfigButton() {
            logger.log('[OpenList外网链接] 准备添加配置按钮');

            const configButton = document.createElement('div');
            configButton.id = 'openlist-config-button';
            configButton.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                width: 40px;
                height: 40px;
                background: #2196F3;
                border-radius: 50%;
                cursor: pointer;
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 18px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                transition: background 0.3s;
            `;

            configButton.innerHTML = '⚙️';
            configButton.title = '配置外网域名映射';

            configButton.addEventListener('mouseover', () => {
                configButton.style.background = '#1976D2';
            });

            configButton.addEventListener('mouseout', () => {
                configButton.style.background = '#2196F3';
            });

            configButton.addEventListener('click', () => {
                logger.log('[OpenList外网链接] 配置按钮被点击');
                this.showConfigDialog();
            });

            document.body.appendChild(configButton);
            logger.log('[OpenList外网链接] 配置按钮已添加到页面，位置: top:80px, right:20px');
        }

        // 显示配置对话框
        showConfigDialog() {
            const dialog = new ConfigDialog(this.configManager);
            dialog.show();
        }
    }

    // 配置对话框
    class ConfigDialog {
        constructor(configManager) {
            this.configManager = configManager;
            this.dialog = null;
        }

        show() {
            if (this.dialog) {
                this.dialog.remove();
            }

            this.createDialog();
            this.loadMappings();
        }

        createDialog() {
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            // 创建对话框
            this.dialog = document.createElement('div');
            this.dialog.style.cssText = `
                background: white;
                border-radius: 8px;
                width: 600px;
                max-width: 90vw;
                max-height: 80vh;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            `;

            this.dialog.innerHTML = `
                <div style="padding: 20px; border-bottom: 1px solid #eee;">
                    <h2 style="margin: 0; color: #333;">域名映射配置</h2>
                </div>
                <div style="padding: 20px; max-height: 400px; overflow-y: auto;">
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                            <input type="text" id="internal-domain" placeholder="内网域名 (如: http://fileserver.local)"
                                   style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <input type="text" id="external-domain" placeholder="外网域名 (如: https://file.myserver.com)"
                                   style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                            <button id="add-mapping" style="padding: 8px 16px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer;">添加</button>
                        </div>
                        <div style="font-size: 12px; color: #666;">
                            示例：内网域名 http://fileserver.local → 外网域名 https://file.myserver.com
                        </div>
                    </div>
                    <div id="mappings-list"></div>
                </div>
                <div style="padding: 20px; border-top: 1px solid #eee; text-align: right;">
                    <button id="close-dialog" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">关闭</button>
                </div>
            `;

            overlay.appendChild(this.dialog);
            document.body.appendChild(overlay);

            // 绑定事件
            this.bindEvents(overlay);
        }

        bindEvents(overlay) {
            // 添加映射
            this.dialog.querySelector('#add-mapping').addEventListener('click', () => {
                this.addMapping();
            });

            // 关闭对话框
            this.dialog.querySelector('#close-dialog').addEventListener('click', () => {
                overlay.remove();
            });

            // 点击遮罩层关闭
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                }
            });

            // 回车添加
            ['#internal-domain', '#external-domain'].forEach(selector => {
                this.dialog.querySelector(selector).addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.addMapping();
                    }
                });
            });
        }

        addMapping() {
            const internalDomain = this.dialog.querySelector('#internal-domain').value.trim();
            const externalDomain = this.dialog.querySelector('#external-domain').value.trim();

            if (!internalDomain || !externalDomain) {
                alert('请填写完整的域名信息');
                return;
            }

            this.configManager.addMapping(internalDomain, externalDomain);
            this.loadMappings();

            // 清空输入框
            this.dialog.querySelector('#internal-domain').value = '';
            this.dialog.querySelector('#external-domain').value = '';
        }

        loadMappings() {
            const mappings = this.configManager.getDomainMappings();
            const listContainer = this.dialog.querySelector('#mappings-list');

            if (mappings.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">暂无域名映射配置</div>';
                return;
            }

            listContainer.innerHTML = mappings.map(mapping => `
                <div style="border: 1px solid #eee; border-radius: 4px; padding: 15px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="font-weight: bold; margin-bottom: 5px;">内网: ${mapping.internalDomain}</div>
                            <div style="color: #666;">外网: ${mapping.externalDomain}</div>
                        </div>
                        <div>
                            <button onclick="configDialog.removeMapping('${mapping.id}')"
                                    style="padding: 4px 8px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 5px;">删除</button>
                        </div>
                    </div>
                </div>
            `).join('');

            // 临时保存引用以供全局调用
            window.configDialog = this;
        }

        removeMapping(id) {
            if (confirm('确定要删除这个域名映射吗？')) {
                this.configManager.removeMapping(id);
                this.loadMappings();
            }
        }
    }

    // 主程序
    function init() {
        logger.init('[OpenList外网链接] 脚本开始初始化...');
        logger.init('[OpenList外网链接] 当前URL:', window.location.href);

        try {
            const configManager = new ConfigManager();
            const urlConverter = new UrlConverter(configManager);
            const menuEnhancer = new MenuEnhancer(configManager, urlConverter);

            menuEnhancer.init();
            logger.init('[OpenList外网链接] 脚本初始化完成');
        } catch (error) {
            logger.error('[OpenList外网链接] 初始化失败:', error);
        }
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        logger.init('[OpenList外网链接] 等待DOM加载完成...');
        document.addEventListener('DOMContentLoaded', init);
    } else {
        logger.init('[OpenList外网链接] DOM已加载，立即初始化');
        // 确保body存在后再初始化
        if (document.body) {
            init();
        } else {
            // 如果body还不存在，等待一下
            setTimeout(init, 100);
        }
    }

})();