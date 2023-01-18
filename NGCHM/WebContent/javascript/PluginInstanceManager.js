// Maintain a database of current plugin instances.
(function() {
    'use strict';
    NgChm.markFile();

    const PIM = NgChm.createNS('NgChm.PIM');
    const UTIL = NgChm.importNS('NgChm.UTIL');
    const UHM = NgChm.importNS('NgChm.UHM');
    const MMGR = NgChm.importNS('NgChm.MMGR');
    const PANE = NgChm.importNS('NgChm.Pane');
    const SRCHSTATE = NgChm.importNS('NgChm.SRCHSTATE');

    // Every plugin instance is identified by a unique nonce.
    // The following object maps nonces to plugin instances.
    const instances = {};

    // Class for a plugin instance.
    class PluginInstance {
	constructor ({ kind, nonce, source, plugin, params, iframe, config, dataFromPlugin} = {}) {
	    if (kind === undefined) kind = "panel-plugin";
	    if (["panel-plugin", "linkout-plugin", "hamburger-plugin"].indexOf(kind) === -1) { alert("Unknown plugin kind"); }
	    Object.assign (this, { kind, nonce, source, plugin, params, iframe, config, dataFromPlugin});
	}
    }

    PIM.getPluginInstance = function getPluginInstance (nonce) {
	return instances[nonce];
    };

    PIM.getPluginInstances = function getPluginInstances() {
	return instances;
    };

    PIM.removePluginInstance = function removePluginInstance (loc, elements) {
	const nonceToRemove = elements[0].getElementsByTagName('IFRAME')[0].dataset.nonce;
	delete instances[nonceToRemove];
    };

    PIM.getPluginInstanceByName = function getPluginInstanceByName (name) {
	let p = 0;
	const k = Object.keys(instances);
	while (p < k.length && instances[k[p]].plugin.name !== name) p++;
	return p === k.length ? null : instances[k[p]];
    };

    // Set the parameters for a panel plugin instance.
    // Element is a DOM element within the panel plugin.
    // Options contains the parameters to set.
    // Also sets the panel's title bar.
    PIM.setPanePluginOptions = function (element, options, initializePlugin) {
	const loc = PANE.findPaneLocation (element);
	const iframe = loc.pane.getElementsByTagName('IFRAME')[0];
	const nonce = iframe.dataset.nonce;
	instances[nonce].params = options;
	loc.paneTitle.innerText = instances[nonce].plugin.name + '. ' + options.plotTitle;
	initializePlugin (nonce, options);
    };

    // Create a new, unique nonce.
    function getNewNonce () {
	const ta = new Uint8Array(16);
	window.crypto.getRandomValues(ta);
	return Array.from(ta).map(x => x.toString(16)).join("");
    }

    // Create a new instance of the specified plugin and return the
    // iframe associated with the new instance.  The caller is
    // responsible for inserting the iframe into the correct place
    // in the DOM.
    PIM.createPluginInstance = function createPluginInstance (kind, plugin) {
	const nonce = getNewNonce();
	const isBlob = /^blob:/.test(plugin.src);
	const url = isBlob ? plugin.src : plugin.src + (plugin.src.indexOf('?') == -1 ? '?' : '&') + 'nonce=' + nonce;

	const iframe = document.createElement('IFRAME');
	iframe.dataset.nonce = nonce;
	instances[nonce] = new PluginInstance ({ kind, nonce, plugin, params: {}, iframe, config: plugin.config });

	iframe.setAttribute('title', plugin.name);
	if (isBlob) {
	    iframe.onload = function() {
		PIM.sendMessageToPlugin ({ nonce, op: 'nonce' });
	    };
	}
	iframe.setAttribute('src', url);

	return iframe;
    };

    // Send a Vanodi message to the plugin instance identified by msg.nonce.
    PIM.sendMessageToPlugin = function sendMessageToPlugin (msg) {
	const src = instances[msg.nonce].source || instances[msg.nonce].iframe.contentWindow;
	if (src !== null) {
		src.postMessage({ vanodi: msg }, '*');
	} else {
		console.warn("Plugin with nonce "+msg.nonce+" does not exist");
	}
    };

    /* Request data generated by plugin and required to recreate state of plugin
       (e.g. the zoom level on a scatter plot)
    */
    PIM.requestDataFromPlugins = function requestDataFromPlugins() {
	let pluginInstances = PIM.getPluginInstances();
	for (const nonce of Object.keys(pluginInstances)) {
		PIM.sendMessageToPlugin ({ nonce, op: 'requestForPluginData'});
	}
    };

    /* Check if all plugins have reported their data
    */
    PIM.havePluginData = function havePluginData() {
	let pluginInstances = PIM.getPluginInstances();
	let havePluginDataList = [];
	Object.keys(pluginInstances).forEach(pi => {
		if (typeof pluginInstances[pi]['dataFromPlugin'] != 'undefined') {
			havePluginDataList.push(pluginInstances[pi]['nonce']);
		}
	})
	if (JSON.stringify(havePluginDataList.sort()) === JSON.stringify(Object.keys(pluginInstances).sort())) {
		return true;
	} else {
		return false;
	}
    };

    /* Display warning message if some plugins did not provide their data
    */
    PIM.warnAboutMissingPluginData = function warnAboutMissingPluginData() {
	if (PIM.havePluginData()) {
		return false; // have all plugins' data...no need for warning message
	}
	let warningText = "Unable to save some data elements from the following plugins: <br>"
	let pluginInstances = PIM.getPluginInstances();
	Object.keys(pluginInstances).forEach(pi => {
		if (typeof pluginInstances[pi]['dataFromPlugin'] == 'undefined') {
			warningText += "<br>&nbsp;&nbsp;" + pluginInstances[pi]['plugin']['name'];
		}
	});
	let dialog = document.getElementById('msgBox');
	UHM.initMessageBox();
	UHM.setMessageBoxHeader("Warning: Unable to save some plugin data");
	UHM.setMessageBoxText(warningText);
	UHM.setMessageBoxButton(1, UTIL.imageTable.okButton, 'OK Button');
	UHM.displayMessageBox();
    };

    // Send a Vanodi message to all plugin instances except the one identified by srcNonce.
    PIM.sendMessageToAllOtherPlugins = function sendMessageToAllOtherPlugins (srcNonce, msg) {
	const iframes = document.getElementsByTagName('iframe');
	for (let i = 0; i < iframes.length; i++) {
	    const nonce = iframes[i].dataset.nonce;
	    if (nonce && nonce !== srcNonce ) {
		PIM.sendMessageToPlugin (Object.assign ({}, msg, {nonce}));
	    }
	}
    };

    // Send message to all plugins regarding selected labels.
    //
    // @function postSelectionToLinkouts
    // @param {String} axis 'Column' (if column label clicked) or 'Row' (if row label clicked)
    // @parram {String} clickType Denotes type of click. Choices: 'standardClick' & 'ctrlClick'
    // @param {int} lastClickIndex Index of last-clicked label. Can be '0' (e.g. if clicked dendogram).
    // @param {String} srcNonce nonce for plugin
    // TODO: make this work with specific registered linkouts
    PIM.postSelectionToPlugins = function(axis, clickType, lastClickIndex, srcNonce) {
	    const allLabels = MMGR.getHeatMap().getAxisLabels(axis).labels;
	    const searchAxis = MMGR.isRow(axis) ? "Row" : "Column";
	    const searchItems = SRCHSTATE.getAxisSearchResults (searchAxis);
	    const pointLabelNames = [];
	    for (let i=0; i<searchItems.length; i++) {
		    let pointId = allLabels[searchItems[i] - 1];
		    pointId = pointId.indexOf("|") !== -1 ? pointId.substring(0,pointId.indexOf("|")) : pointId;
		    pointLabelNames.push(pointId);
	    }
	    const lastClickText = lastClickIndex > 0 ? allLabels[lastClickIndex] : '';
	    PIM.sendMessageToAllOtherPlugins (srcNonce, {
		op: 'makeHiLite',
		data: { axis, pointIds:pointLabelNames, clickType, lastClickText }
	    });
    };

})();
