import { App, Plugin, Notice, Modal, Setting, TextAreaComponent } from 'obsidian';

// モーダル: 指定リンク入力用（UI改善版）
class LinkInputModal extends Modal {
  private onSubmit: (fileNames: string[]) => void;
  private textareaEl: TextAreaComponent;

  constructor(app: App, onSubmit: (fileNames: string[]) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { titleEl, contentEl } = this;
    // ヘッダー
    titleEl.setText('まとめたいノートのリンクを入力');
    titleEl.style.marginBottom = '8px';

    // 説明テキスト
    contentEl.createEl('p', {
      text: '例: [[NoteA]] [[Folder/NoteB]] をスペース区切りで複数指定できます',
      cls: 'setting-item-description'
    });

    // テキストエリア
    const setting = new Setting(contentEl)
      .setName('リンク入力')
      .setDesc('[[ファイル名]] を複数指定')
      .addTextArea(text => {
        this.textareaEl = text;
        text.setPlaceholder('[[ファイル名]] を指定');
        text.inputEl.style.width = '100%';
        text.inputEl.style.minHeight = '80px';
        text.inputEl.style.resize = 'vertical';
        text.inputEl.style.padding = '4px';
      });

    // ボタン行
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
           const re = /\[\[([^\]]+)\]\]/g;
           let match: RegExpExecArray | null;
           while ((match = re.exec(raw)) !== null) {
             names.push(match[1].trim());
           }
           if (names.length === 0) {
             new Notice('リンクが検出されませんでした。');
             return;
           }
           this.close();
           this.onSubmit(names);
         });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

export default class SmartMergerPlugin extends Plugin {
  async onload() {
    console.log('Loading SmartMergerPlugin');

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
          try {
            await this.app.vault.create(outputFileName, content);
            new Notice(`Created ${outputFileName}`);
          } catch (error) {
            console.error(error);
            new Notice('ファイル作成中にエラーが発生しました。');
          }
        };

        for (let i = 0; i < totalFiles; i++) {
          const file = mdFiles[i];
          statusBarItem.setText(`[${i+1}/${totalFiles}] ${file.basename} を処理中...`);
          try {
            const content = await this.app.vault.read(file);
            mergedContent += `\n\n## ${file.basename}\n\n${content}`;
          } catch {
            mergedContent += `\n\n## ${file.basename} (読み込みエラー)\n\n`;
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
            try {
              await this.app.vault.create(name, content);
              new Notice(`Created ${name}`);
            } catch (e) {
              console.error(e);
              new Notice('ファイル作成中にエラーが発生しました。');
            }
          };

          for (let i = 0; i < targetFiles.length; i++) {
            const file = targetFiles[i];
            statusBarItem.setText(`[${i+1}/${targetFiles.length}] ${file.basename} を処理中...`);
            try {
              const txt = await this.app.vault.read(file);
              merged += `\n\n## ${file.basename}\n\n${txt}`;
            } catch {
              merged += `\n\n## ${file.basename} (読み込みエラー)\n\n`;
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
}
