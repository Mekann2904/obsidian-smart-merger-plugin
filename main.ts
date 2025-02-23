import { Plugin, Notice } from 'obsidian';

export default class SmartMergerPlugin extends Plugin {
	async onload() {
		console.log("Loading SmartMergerPlugin");

		// 「Smart Merger with Progress」コマンドを登録
		this.addCommand({
			id: 'smart-merger-with-progress',
			name: 'Smart Merger with Progress',
			callback: async () => {
				// ステータスバーに進捗情報を表示
				const statusBarItem = this.addStatusBarItem();
				statusBarItem.setText("マージ処理を開始中...");

				// 保管庫内の全 Markdown ファイルを取得し、パス順にソート
				const mdFiles = this.app.vault.getMarkdownFiles();
				mdFiles.sort((a, b) => a.path.localeCompare(b.path));

				const totalFiles = mdFiles.length;
				let mergedContent = "";
				// 例として10MBを上限とする（文字数はおおよその目安）
				const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
				let partCounter = 1;

				// 現在日時をフォーマットしてファイル名に利用（例: 20250223_153045）
				const now = new Date();
				const formattedDate = `${now.getFullYear()}${("0" + (now.getMonth() + 1)).slice(-2)}${("0" + now.getDate()).slice(-2)}_${("0" + now.getHours()).slice(-2)}${("0" + now.getMinutes()).slice(-2)}${("0" + now.getSeconds()).slice(-2)}`;
				const pluginName = "SmartMerger";

				// 内容をファイルに出力するヘルパー関数
				const flushContent = async (content: string, part: number) => {
					const outputFileName = `${pluginName}_${formattedDate}_part${part}.md`;
					try {
						await this.app.vault.create(outputFileName, content);
						new Notice(`Created ${outputFileName}`);
					} catch (error) {
						console.error("Error creating merged file:", error);
						new Notice("ファイル作成中にエラーが発生しました。");
					}
				};

				// 各Markdownファイルを順次処理
				for (let i = 0; i < totalFiles; i++) {
					const file = mdFiles[i];
					statusBarItem.setText(`[${i + 1}/${totalFiles}] ${file.basename} を処理中...`);
					try {
						const content = await this.app.vault.read(file);
						// 各ファイルの先頭に見出しを付与して結合
						mergedContent += `\n\n## ${file.basename}\n\n${content}`;
					} catch (error) {
						console.error(`Error reading file ${file.path}:`, error);
						mergedContent += `\n\n## ${file.basename} (読み込みエラー)\n\n`;
					}

					// マージ済み内容が一定サイズを超えたらファイルに出力し、変数をクリア
					if (mergedContent.length >= MAX_CONTENT_LENGTH) {
						await flushContent(mergedContent, partCounter);
						partCounter++;
						mergedContent = "";
					}
				}

				// 残った内容があればファイルに出力
				if (mergedContent.length > 0) {
					await flushContent(mergedContent, partCounter);
				}

				statusBarItem.setText(`完了: ${totalFiles} 個のファイルをマージしました。`);
				new Notice(`Merged ${totalFiles} files into ${pluginName} files.`);
				// 一定時間後にステータスバーの表示をクリア
				setTimeout(() => {
					statusBarItem.remove();
				}, 5000);
			}
		});
	}

	onunload() {
		console.log("Unloading SmartMergerPlugin");
	}
}
