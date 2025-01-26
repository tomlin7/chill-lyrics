import axios from "axios";
import * as vscode from "vscode";

interface LyricsResponse {
  lyrics: string;
}

interface SearchMessage {
  command: "search";
  artist: string;
  title: string;
}

interface ShowLyricsMessage {
  type: "showLyrics";
  lyrics?: string;
  error?: string;
}

class LyricsViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private readonly _context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };

    this._updateWebview();
  }

  private async _updateWebview(): Promise<void> {
    if (!this._view) {
      return;
    }

    this._view.webview.html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              padding: 10px; 
              color: var(--vscode-foreground);
              font-family: var(--vscode-font-family);
            }
            .search-container {
              margin-bottom: 16px;
            }
            input { 
              width: 100%; 
              margin-bottom: 8px; 
              padding: 6px 8px;
              background: var(--vscode-input-background);
              color: var(--vscode-input-foreground);
              border: 1px solid var(--vscode-input-border);
              border-radius: 2px;
              box-sizing: border-box;
            }
            input:focus {
              outline: 1px solid var(--vscode-focusBorder);
              border-color: var(--vscode-focusBorder);
            }
            button { 
              width: 100%; 
              padding: 6px 14px;
              background: var(--vscode-button-background);
              color: var(--vscode-button-foreground);
              border: none;
              border-radius: 2px;
              cursor: pointer;
            }
            button:hover {
              background: var(--vscode-button-hoverBackground);
            }
            button:disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }
            .result { 
              margin-top: 16px; 
              white-space: pre-wrap;
              font-size: 13px;
              line-height: 1.4;
            }
            .loading {
              display: none;
              margin: 10px 0;
              font-style: italic;
              color: var(--vscode-descriptionForeground);
            }
            .error {
              color: var(--vscode-errorForeground);
              margin: 10px 0;
            }
          </style>
        </head>
        <body>
          <div class="search-container">
            <input type="text" id="artist" placeholder="Artist name" spellcheck="false">
            <input type="text" id="title" placeholder="Song title" spellcheck="false">
            <button id="searchBtn">Search</button>
          </div>
          <div id="loading" class="loading">Searching for lyrics...</div>
          <div id="result" class="result"></div>

          <script>
            const vscode = acquireVsCodeApi();
            const searchBtn = document.getElementById('searchBtn');
            const artistInput = document.getElementById('artist');
            const titleInput = document.getElementById('title');
            const loadingDiv = document.getElementById('loading');
            const resultDiv = document.getElementById('result');

            function search() {
              const artist = artistInput.value.trim();
              const title = titleInput.value.trim();
              
              if (!artist || !title) {
                resultDiv.innerHTML = '<div class="error">Please enter both artist and song title</div>';
                return;
              }

              loadingDiv.style.display = 'block';
              resultDiv.textContent = '';
              searchBtn.disabled = true;
              
              vscode.postMessage({
                command: 'search',
                artist,
                title
              });
            }

            searchBtn.addEventListener('click', search);

            [artistInput, titleInput].forEach(input => {
              input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                  search();
                }
              });
            });

            window.addEventListener('message', event => {
              const message = event.data;
              loadingDiv.style.display = 'none';
              searchBtn.disabled = false;

              if (message.type === 'showLyrics') {
                if (message.error) {
                  resultDiv.innerHTML = \`<div class="error">\${message.error}</div>\`;
                } else {
                  resultDiv.textContent = message.lyrics || 'No lyrics found';
                }
              }
            });
          </script>
        </body>
      </html>
    `;

    this._view.webview.onDidReceiveMessage(async (message: SearchMessage) => {
      if (message.command === "search") {
        try {
          const response = await axios.get<LyricsResponse>(
            `https://api.lyrics.ovh/v1/${encodeURIComponent(
              message.artist
            )}/${encodeURIComponent(message.title)}`
          );

          this._view?.webview.postMessage({
            type: "showLyrics",
            lyrics: response.data.lyrics,
          } as ShowLyricsMessage);
        } catch (error) {
          let errorMessage = "Failed to fetch lyrics";
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            errorMessage = "Lyrics not found for this song";
          }

          this._view?.webview.postMessage({
            type: "showLyrics",
            error: errorMessage,
          } as ShowLyricsMessage);
        }
      }
    });
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new LyricsViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("chillLyricsView", provider)
  );

  const disposable = vscode.commands.registerCommand(
    "chill.searchLyrics",
    async () => {
      const artist = await vscode.window.showInputBox({
        placeHolder: "Enter artist name",
        prompt: "Artist name",
      });

      if (!artist) return;

      const title = await vscode.window.showInputBox({
        placeHolder: "Enter song title",
        prompt: "Song title",
      });

      if (!title) return;

      await vscode.commands.executeCommand("chillLyricsView.focus");
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
