import { App, Plugin, Notice, Modal, Setting, TextAreaComponent, PluginSettingTab } from 'obsidian';

// 設定インターフェース
interface SmartMergerSettings {
  outputDestination: 'vault' | 'external' | 'both';
  externalDir: string; // 絶対パス推奨（デスクトップ版のみ）
}

const DEFAULT_SETTINGS: SmartMergerSettings = {
  outputDestination: 'vault',
  externalDir: ''
};

// モーダル: 指定リンク入力用（UI改善版 + 記法拡張）
class LinkInputModal extends Modal {
  private onSubmit: (fileNames: string[]) => void;
  private textareaEl: TextAreaComponent;

  constructor(app: App, onSubmit: (fileNames: string[]) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { titleEl, contentEl } = this;
    titleEl.setText('まとめたいノートのリンクを入力');
    titleEl.style.marginBottom = '8px';

    contentEl.createEl('p', {
      text: '例: [[NoteA]] [NoteB](Folder/NoteB) [リンクテキスト](app://obsidian.md/パス) をスペース区切りで複数指定できます',
      cls: 'setting-item-description'
    });

    const setting = new Setting(contentEl)
      .setName('リンク入力')
      .setDesc('[[ファイル名]] または [テキスト](ファイルパス／app://obsidian.md/相対パス) を複数指定')
      .addTextArea(text => {
        this.textareaEl = text;
        text.setPlaceholder('[[ファイル名]] や [テキスト](ファイルパス) を指定');
        text.inputEl.style.width = '100%';
        text.inputEl.style.minHeight = '80px';
        text.inputEl.style.resize = 'vertical';
        text.inputEl.style.padding = '4px';
      });

    const btnSetting = new Setting(contentEl);
    btnSetting.controlEl.style.display = 'flex';
    btnSetting.controlEl.style.justifyContent = 'flex-end';
    btnSetting.controlEl.style.marginTop = '12px';

    // キャンセルボタン
    btnSetting.addButton(btn => {
      btn.setButtonText('キャンセル')
         .onClick(() => this.close());
      btn.buttonEl.style.marginRight = '8px';
    });

    // OKボタン
    btnSetting.addButton(btn => {
      btn.setButtonText('OK')
         .setCta()
         .onClick(() => {
           const raw = this.textareaEl.getValue() || '';
           const names: string[] = [];

           // Wikiリンク抽出
           const wikiRe = /\[\[([^\]]+)\]\]/g;
           let wikiMatch: RegExpExecArray | null;
           while ((wikiMatch = wikiRe.exec(raw)) !== null) {
             names.push(wikiMatch[1].trim());
           }

           // Markdownリンク抽出
           const mdRe = /\[([^\]]+)\]\(([^)]+)\)/g;
           let mdMatch: RegExpExecArray | null;
           while ((mdMatch = mdRe.exec(raw)) !== null) {
             let target = mdMatch[2].trim();
             // app://obsidian.md/ プレフィックスを除去
             if (target.startsWith('app://obsidian.md/')) {
               target = target.replace('app://obsidian.md/', '');
             }
             // URI デコード
             try {
               target = decodeURIComponent(target);
             } catch {}
             names.push(target);
           }

           // 重複排除
           const uniqueNames = Array.from(new Set(names));
           if (uniqueNames.length === 0) {
             new Notice('リンクが検出されませんでした。');
             return;
           }
           this.close();
           this.onSubmit(uniqueNames);
         });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class SmartMergerSettingTab extends PluginSettingTab {
  plugin: SmartMergerPlugin;

  constructor(app: App, plugin: SmartMergerPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'SmartMerger 設定' });

    new Setting(containerEl)
      .setName('出力先')
      .setDesc('Vault 内、外部フォルダ、または両方に出力します（外部はデスクトップ版のみ）。')
      .addDropdown(dd => {
        dd.addOption('vault', 'Vault 内');
        dd.addOption('external', '外部フォルダ');
        dd.addOption('both', '両方');
        dd.setValue(this.plugin.settings.outputDestination);
        dd.onChange(async (value: 'vault' | 'external' | 'both') => {
          this.plugin.settings.outputDestination = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('外部出力フォルダ')
      .setDesc('絶対パス推奨。例: /Users/you/Exports（デスクトップ版のみ）。')
      .addText(text => {
        text.setPlaceholder('/absolute/path/to/output')
          .setValue(this.plugin.settings.externalDir)
          .onChange(async (val) => {
            this.plugin.settings.externalDir = val.trim();
            await this.plugin.saveSettings();
          });
      });
  }
}

export default class SmartMergerPlugin extends Plugin {
  settings: SmartMergerSettings;

  private getFs() {
    const anyWindow = (window as any);
    const requireFn = anyWindow?.require;
    try {
      if (!requireFn) return { fs: null as any, path: null as any };
      const fs = requireFn('fs');
      const path = requireFn('path');
      return { fs, path };
    } catch (_e) {
      return { fs: null as any, path: null as any };
    }
  }

  private writeExternalFile = async (fileName: string, content: string) => {
    const { fs, path } = this.getFs();
    if (!fs || !path) {
      new Notice('外部出力はデスクトップ版でのみ利用できます。');
      return;
    }
    const dir = (this.settings.externalDir || '').trim();
    if (!dir) {
      new Notice('外部出力フォルダが設定されていません。設定から指定してください。');
      return;
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      const ext = path.extname(fileName);
      const baseName = fileName.slice(0, fileName.length - ext.length);
      let target = path.join(dir, fileName);
      let i = 1;
      while (fs.existsSync(target) && i < 1000) {
        target = path.join(dir, `${baseName}(${i++})${ext}`);
      }
      fs.writeFileSync(target, content, 'utf8');
      new Notice(`外部に出力しました: ${target}`);
    } catch (e) {
      console.error(e);
      new Notice('外部出力に失敗しました。権限やパスを確認してください。');
    }
  };

  async onload() {
    console.log('Loading SmartMergerPlugin');
    await this.loadSettings();
    this.addSettingTab(new SmartMergerSettingTab(this.app, this));

    // コマンド1: 全Markdownファイルをマージ
    this.addCommand({
      id: 'smart-merger-all',
      name: 'Smart Merger with Progress (All)',
      callback: async () => {
        const statusBarItem = this.addStatusBarItem();
        statusBarItem.setText('マージ処理を開始中...');

        const mdFiles = this.app.vault
          .getMarkdownFiles()
          .sort((a, b) => a.path.localeCompare(b.path));
        const totalFiles = mdFiles.length;
        let mergedContent = '';
        const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
        let partCounter = 1;

        const now = new Date();
        const formattedDate = `${now.getFullYear()}${('0'+(now.getMonth()+1)).slice(-2)}${('0'+now.getDate()).slice(-2)}_${('0'+now.getHours()).slice(-2)}${('0'+now.getMinutes()).slice(-2)}${('0'+now.getSeconds()).slice(-2)}`;
        const pluginName = 'SmartMerger';

        const flushContent = async (content: string, part: number) => {
          const outputFileName = `${pluginName}_${formattedDate}_part${part}.md`;
          const dest = this.settings.outputDestination;
          const writeToVault = dest === 'vault' || dest === 'both';
          const writeToExternal = dest === 'external' || dest === 'both';
          if (writeToVault) {
            try {
              await this.app.vault.create(outputFileName, content);
              new Notice(`Created ${outputFileName}`);
            } catch (error) {
              console.error(error);
              new Notice('Vault へのファイル作成中にエラーが発生しました。');
            }
          }
          if (writeToExternal) {
            await this.writeExternalFile(outputFileName, content);
          }
        };

        for (let i = 0; i < totalFiles; i++) {
          const file = mdFiles[i];
          statusBarItem.setText(`[${i+1}/${totalFiles}] ${file.basename} を処理中...`);
          try {
            const content = await this.app.vault.read(file);
            mergedContent += `

## ${file.basename}

${content}`;
          } catch {
            mergedContent += `

## ${file.basename} (読み込みエラー)

`;
          }
          if (mergedContent.length >= MAX_CONTENT_LENGTH) {
            await flushContent(mergedContent, partCounter++);
            mergedContent = '';
          }
        }
        if (mergedContent) {
          await flushContent(mergedContent, partCounter);
        }

        statusBarItem.setText(`完了: ${totalFiles} 個のファイルをマージしました。`);
        new Notice(`Merged ${totalFiles} files.`);
        setTimeout(() => statusBarItem.remove(), 5000);
      }
    });

    // コマンド2: ユーザ指定リンクのみマージ
    this.addCommand({
      id: 'smart-merger-with-links',
      name: 'Smart Merger with Specified Links',
      callback: () => {
        new LinkInputModal(this.app, async (fileNames) => {
          const statusBarItem = this.addStatusBarItem();
          statusBarItem.setText('マージ処理を開始中...');

          const allMd = this.app.vault.getMarkdownFiles();
          const targetFiles = allMd
            .filter(f => fileNames.includes(f.basename) || fileNames.includes(f.path))
            .sort((a, b) => a.path.localeCompare(b.path));

          if (targetFiles.length === 0) {
            new Notice('指定されたノートが見つかりませんでした。');
            statusBarItem.remove();
            return;
          }

          let merged = '';
          const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
          let part = 1;

          const now = new Date();
          const formattedDate = `${now.getFullYear()}${('0'+(now.getMonth()+1)).slice(-2)}${('0'+now.getDate()).slice(-2)}_${('0'+now.getHours()).slice(-2)}${('0'+now.getMinutes()).slice(-2)}${('0'+now.getSeconds()).slice(-2)}`;
          const pluginName = 'SmartMerger';

          const flush = async (content: string, idx: number) => {
            const name = `${pluginName}_${formattedDate}_part${idx}.md`;
            const dest = this.settings.outputDestination;
            const writeToVault = dest === 'vault' || dest === 'both';
            const writeToExternal = dest === 'external' || dest === 'both';
            if (writeToVault) {
              try {
                await this.app.vault.create(name, content);
                new Notice(`Created ${name}`);
              } catch (e) {
                console.error(e);
                new Notice('Vault へのファイル作成中にエラーが発生しました。');
              }
            }
            if (writeToExternal) {
              await this.writeExternalFile(name, content);
            }
          };

          for (let i = 0; i < targetFiles.length; i++) {
            const file = targetFiles[i];
            statusBarItem.setText(`[${i+1}/${targetFiles.length}] ${file.basename} を処理中...`);
            try {
              const txt = await this.app.vault.read(file);
              merged += `

## ${file.basename}

${txt}`;
            } catch {
              merged += `

## ${file.basename} (読み込みエラー)

`;
            }
            if (merged.length >= MAX_CONTENT_LENGTH) {
              await flush(merged, part++);
              merged = '';
            }
          }
          if (merged) {
            await flush(merged, part);
          }

          statusBarItem.setText(`完了: ${targetFiles.length} 個のファイルをマージしました。`);
          new Notice(`${targetFiles.length} 個のリンクファイルをマージしました。`);
          setTimeout(() => statusBarItem.remove(), 5000);
        }).open();
      }
    });
  }

  onunload() {
    console.log('Unloading SmartMergerPlugin');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
