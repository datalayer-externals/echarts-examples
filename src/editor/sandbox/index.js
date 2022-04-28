import srcdoc from './srcdoc.html';
import handleLoop from './handleLoop';
import setup from './setup';
import loopController from 'raw-loader!./loopController';
import showDebugDirtyRect from 'raw-loader!../../dep/showDebugDirtyRect';
import estraverse from 'raw-loader!./estraverse.browser';

export function createSandbox(
  container,
  scripts,
  onload,
  onerror,
  onCodeError,
  onOptionUpdated,
  onCSSParsed
) {
  scripts = (scripts && scripts.slice()) || [];
  scripts.push(
    { content: estraverse },
    { content: loopController },
    {
      content: `
        (function(){
          ${handleLoop}
          ${showDebugDirtyRect}
          ${setup}
          setup()
        })()
      `
    }
  );

  const sandbox = document.createElement('iframe');
  sandbox.setAttribute(
    'sandbox',
    [
      'allow-modals',
      'allow-pointer-lock',
      'allow-same-origin',
      'allow-scripts',
      'allow-downloads'
    ].join(' ')
  );
  sandbox.style.cssText = 'width:100%;height:100%;border:none;background:none';
  sandbox.srcdoc = srcdoc.replace(
    '<!--SCRIPTS-->',
    scripts
      .map((script) =>
        script.content
          ? `<script>${script.content}</script>`
          : `<script src="${script.src}"></script>`
      )
      .join('')
  );
  sandbox.onload = () => {
    // FIXME
    // No good way to prevent the user from trying to redirect the iframe via `document.location.href = xxx`
    // This is a tricky way
    // `onload` will be triggered again after the iframe redirects
    // here we check and block it as we usually won't do this
    if (sandbox.__loaded__) {
      const errorMsg = 'potential redirection from the code was blocked';
      console.error(errorMsg);
      onCodeError(errorMsg);
      onerror();
      return;
    }
    sandbox.__loaded__ = true;
    onload();
  };
  sandbox.onerror = onerror;
  container.appendChild(sandbox);

  function hanldeMessage(e) {
    if (e.source !== sandbox.contentWindow) {
      return;
    }
    const data = e.data;
    switch (data.evt) {
      case 'optionUpdated':
        onOptionUpdated(data.updateTime);
        break;
      // case 'error':
      // case 'unhandledRejection':
      //   onerror();
      //   break;
      case 'codeError':
        onCodeError(data.message);
        break;
      case 'cssParsed':
        onCSSParsed(data.css);
        break;
      default:
        break;
    }
  }

  function sendMessage(action, argumentMap) {
    sandbox.contentWindow.postMessage({ action, ...argumentMap }, '*');
  }

  function getChartInstance() {
    return sandbox.contentWindow.chartInstance;
  }

  window.addEventListener('message', hanldeMessage, false);

  return {
    dispose() {
      sendMessage('dispose');
      window.removeEventListener('message', hanldeMessage);
      container.removeChild(sandbox);
    },
    run(store, recreateInstance) {
      sendMessage('run', { store, recreateInstance });
    },
    screenshot(filename) {
      sendMessage('screenshot', { filename });
    },
    getOption() {
      // sendMessage('getOption');
      const chart = getChartInstance();
      return chart && chart.getOption();
    }
  };
}
