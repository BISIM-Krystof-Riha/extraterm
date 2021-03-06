/*
 * Copyright 2016 Simon Edwards <simon@simonzone.com>
 *
 * This source code is licensed under the MIT license which is detailed in the LICENSE.txt file.
 */

// Key bindings tab

"use strict";
import _ = require('lodash');
import ThemeTypes = require('./theme');
import ViewerElement  = require('./viewerelement');
import ThemeableElementBase = require('./themeableelementbase');
import keybindingmanager = require('./keybindingmanager');
type KeyBindingManager = keybindingmanager.KeyBindingManager;
import ViewerElementTypes = require('./viewerelementtypes');
import BulkDOMOperation = require('./BulkDOMOperation');

import Vue = require('vue');
import domutils = require('./domutils');
import config = require('./config');
type Config = config.Config;
type ConfigManager = config.ConfigManager;

import GeneralEvents = require('./generalevents');
import LogDecorator = require('./logdecorator');

var humanText = require('./keybindingstext.json');

const log = LogDecorator;

const ID_SELECTOR = "ID_SELECTOR";
const ID_KEY_BINDINGS = "ID_KEY_BINDINGS";
const CLASS_KEYCAP = "CLASS_KEYCAP";

let registered = false;

function contexts(): string[] {
  return humanText.contexts;
}

function commandName(commandCode: string): string {
  const str = humanText.commands[commandCode];
  return str || commandCode;
}

function contextHeading(contextName: string): string {
  const str = humanText.contextNames[contextName];
  return str || contextName;
}

function formatShortcut(code: string): string {
  if (process.platform !== "darwin") {
    return code;
  }
  let parts = code.split(/\+/g);
  parts = parts.map( (p) => {
    switch (p) {
      case 'Cmd':
        return '\u2318';
      case 'Shift':
        return '\u21E7';
      case 'Alt':
        return '\u2325';
      case 'Ctrl':
        return '^';
      default:
        return p;
    }
  } );
  return parts.join("");
}

interface ModelData {
  selectedKeyBindings: string;
  keyBindingsFiles: config.KeyBindingInfo[];
  keyBindingsContextsStamp: any;
}

/**
 * The Extraterm Key Bindings tab.
 */
class EtKeyBindingsTab extends ViewerElement implements config.AcceptsConfigManager,
    keybindingmanager.AcceptsKeyBindingManager {
  
  /**
   * The HTML tag name of this element.
   */
  static TAG_NAME = "ET-KEYBINDINGS-TAB";

  /**
   * Initialize the EtKeyBindingsTab class and resources.
   *
   * When EtKeyBindingsTab is imported into a render process, this static method
   * must be called before an instances may be created. This is can be safely
   * called multiple times.
   */
  static init(): void {
    if (registered === false) {
      window.document.registerElement(EtKeyBindingsTab.TAG_NAME, {prototype: EtKeyBindingsTab.prototype});
      registered = true;
    }
  }
  
  //-----------------------------------------------------------------------
  // WARNING: Fields like this will not be initialised automatically.
  private _configManager: ConfigManager;

  private _keyBindingManager: KeyBindingManager;

  private _vm: VueJSInstance<ModelData>;
  
  private _data: ModelData;

  private _initProperties(): void {
    this._configManager = null;
    this._keyBindingManager = null;
    this._vm = null;
    this._data = {
      selectedKeyBindings: "",
      keyBindingsFiles: [],
      keyBindingsContextsStamp: Date.now()
    };
  }
  
  //-----------------------------------------------------------------------
  //
  // ######                                
  // #     # #    # #####  #      #  ####  
  // #     # #    # #    # #      # #    # 
  // ######  #    # #####  #      # #      
  // #       #    # #    # #      # #      
  // #       #    # #    # #      # #    # 
  // #        ####  #####  ###### #  ####  
  //
  //-----------------------------------------------------------------------
  setKeyBindingManager(newKeyBindingManager: KeyBindingManager): void {
    if (this._keyBindingManager !== null) {
      this._keyBindingManager.unregisterChangeListener(this);
    }
    
    this._keyBindingManager = newKeyBindingManager;
    if (this._keyBindingManager !== null) {
      this._keyBindingManager.registerChangeListener(this, this._onKeyBindingChange.bind(this));
    }
  }
  
  get awesomeIcon(): string {
    return "keyboard-o";
  }
  
  get title(): string {
    return "Key Bindings";
  }

  focus(): void {
    // util.getShadowId(this, ID_CONTAINER).focus();
  }

  hasFocus(): boolean {
    return false;
  }
  
  setConfigManager(configManager: ConfigManager): void {
    this._configManager = configManager;
    this._configManager.registerChangeListener(this, () => {
      this._setConfig(configManager.getConfig());
    });
    this._setConfig(configManager.getConfig());
  }

  getMode(): ViewerElementTypes.Mode {
    return ViewerElementTypes.Mode.DEFAULT;
  }

  bulkSetMode(mode: ViewerElementTypes.Mode): BulkDOMOperation.BulkDOMOperation {
    return BulkDOMOperation.nullOperation();
  }

  getVisualState(): ViewerElementTypes.VisualState {
    return ViewerElementTypes.VisualState.AUTO;
  }

  bulkSetVisualState(state: ViewerElementTypes.VisualState): BulkDOMOperation.BulkDOMOperation {
    return BulkDOMOperation.nullOperation();
  }

  //-----------------------------------------------------------------------
  //
  //   #                                                         
  //   #       # ###### ######  ####  #   #  ####  #      ###### 
  //   #       # #      #      #    #  # #  #    # #      #      
  //   #       # #####  #####  #        #   #      #      #####  
  //   #       # #      #      #        #   #      #      #      
  //   #       # #      #      #    #   #   #    # #      #      
  //   ####### # #      ######  ####    #    ####  ###### ###### 
  //
  //-----------------------------------------------------------------------

  /**
   * Custom Element 'created' life cycle hook.
   */
  createdCallback(): void {
    this._initProperties();
  }
  
  /**
   * Custom Element 'attached' life cycle hook.
   */
  attachedCallback(): void {
    super.attachedCallback();
    
    const shadow = this.attachShadow({ mode: 'open', delegatesFocus: true });
    const themeStyle = document.createElement('style');
    themeStyle.id = ThemeableElementBase.ID_THEME;
    shadow.appendChild(themeStyle);
    
    const vueDivContainer = document.createElement('div');
    vueDivContainer.id = ID_KEY_BINDINGS;
    shadow.appendChild(vueDivContainer);
    
    Vue.config.debug = true;
    
    const elementThis = this;
    this._vm = new Vue({
      data: this._data,
      template: 
`<div className=''>
  <h1>Key Bindings</h1>
  
  <div className=''>
    <div class="form-horizontal">
      <div class="form-group">
        <label for="theme-terminal" class="col-sm-2 control-label">Key bindings style:</label>
        <div class="col-sm-3">
          <select class="form-control" id="keybindings-style" v-model="selectedKeyBindings">
            <option v-for="option in keyBindingsFiles" v-bind:value="option.filename">
              {{ option.name }}
            </option>
          </select>
        </div>
      </div>
  </div>
  
  {{{ summary }}}
</div>
`,
      computed: {
        summary: function() {
          const foo = this.keyBindingsContextsStamp;
          return formatKeyBindingsPage(elementThis._keyBindingManager.getKeyBindingContexts());
        }
      }
    });
    this._vm.$mount(vueDivContainer);
    this._vm.$watch('$data', this._dataChanged.bind(this), { deep: true, immediate: false, sync: false } );
    
    this.updateThemeCss();
  }

  /**
   * Custom Element 'detached' life cycle hook.
   */
  detachedCallback(): void {
    if (this._configManager !== null) {
      this._configManager.unregisterChangeListener(this);
    }
    if (this._keyBindingManager !== null) {
      this._keyBindingManager.unregisterChangeListener(this);
    }
    super.detachedCallback();
  }

  //-----------------------------------------------------------------------
  //
  // ######                                      
  // #     # #####  # #    #   ##   ##### ###### 
  // #     # #    # # #    #  #  #    #   #      
  // ######  #    # # #    # #    #   #   #####  
  // #       #####  # #    # ######   #   #      
  // #       #   #  #  #  #  #    #   #   #      
  // #       #    # #   ##   #    #   #   ###### 
  //
  //-----------------------------------------------------------------------
  private _onKeyBindingChange(): void {
    this._data.keyBindingsContextsStamp = Date.now();
  }

  private _setConfig(config: Config): void {
    if (this._data.keyBindingsFiles.length !== config.systemConfig.keyBindingsFiles.length) {
      this._data.keyBindingsFiles = config.systemConfig.keyBindingsFiles;
    }
    if (this._data.selectedKeyBindings !== config.keyBindingsFilename) {
      this._data.selectedKeyBindings = config.keyBindingsFilename;
    }
  }
  
  protected _themeCssFiles(): ThemeTypes.CssFile[] {
    return [ThemeTypes.CssFile.GUI_CONTROLS, ThemeTypes.CssFile.KEY_BINDINGS_TAB];
  }
  
  @log
  private _dataChanged(newVal: ModelData): void {
    const newConfig = _.cloneDeep(this._configManager.getConfig());
    if (newConfig.keyBindingsFilename !== newVal.selectedKeyBindings) {
      newConfig.keyBindingsFilename = newVal.selectedKeyBindings;
      this._configManager.setConfig(newConfig);
    }
  }
}

function formatKeyBindingsPage(keyBindingContexts: keybindingmanager.KeyBindingContexts): string {
  return contexts()
    .map( (contextName) => {
        return `<h2>${contextHeading(contextName)}</h2>` +  formatKeyBindingsMapping(keyBindingContexts.context(contextName));
      } ).join("");
}

function formatKeyBindingsMapping(context: keybindingmanager.KeyBindingMapping): string {
  const bindings = _.clone(context.keyBindings);
  bindings.sort( (a,b): number => {
    const nameA = commandName(a.command);
    const nameB = commandName(b.command);
    return nameA < nameB ? -1 : ( nameA > nameB ? 1 : 0);
  });
  
  return `<table class='table'>
    <tr>
      <th class="col-md-7">Command</th>
      <th class="col-md-2">Shortcut</th>
      <th class="col-md-3">Code</th>
    </tr>` +
      bindings.map( (binding) => `<tr>
        <td class="col-md-7">${commandName(binding.command)}</td>
        <td class="col-md-2"><div class='${CLASS_KEYCAP}'><span>${formatShortcut(binding.shortcut)}</span></div></td>
        <td class="col-md-3">${binding.command}</td></tr>`).join("\n") +
      "</table>";
}

export = EtKeyBindingsTab;
