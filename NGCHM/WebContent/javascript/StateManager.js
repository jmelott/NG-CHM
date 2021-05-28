"use strict";
/**
 *	Initial stub of a file for code to handle state management. 
 */

NgChm.createNS('NgChm.StateMan');

(function(){

	NgChm.StateMan.reconstructPanelsFromMapConfig = reconstructPanelsFromMapConfig;
	/**
	 *	Reconstruct the panels from data in the mapConfig.json file
	 */
	async function reconstructPanelsFromMapConfig() {
		if (NgChm.heatMap && NgChm.heatMap.isMapLoaded() && NgChm.LNK.getPanePlugins().length>0) { // map ready
			reconstructPanelLayoutFromMapConfig();
			recreateReconstructedPanes();
			setPanesContent()
			addDividerControlsToResizeHelpers();
			addResizeHandlersToContainers();
			window.dispatchEvent(new Event('resize'))
		} else { // wait for NGCHM to initialize itself
			setTimeout(reconstructPanelsFromMapConfig, 100)
		}
	}
	
	/**
	 *	Reconstruct ngChmContainer and pane layout.
	 */ 
	function reconstructPanelLayoutFromMapConfig() {
		let baseNgChmContainer = document.getElementById('ngChmContainer1')
		let panelsJSON = NgChm.heatMap.getPanelConfiguration()['panels'];
		let reconstructedPanels = domJSON.toDOM(panelsJSON)
		baseNgChmContainer.parentNode.replaceChild(reconstructedPanels, baseNgChmContainer)
	}

	/**
	 * Add DividerControl methods to resizeHelper elements
	 */
	function addDividerControlsToResizeHelpers() {
		let dividers = document.getElementsByClassName("resizerHelper")
		for (let i=0; i<dividers.length; i++) {
			dividers[i].dividerController = new NgChm.Pane.DividerControl(dividers[i])
		}
	}

	/**
	 * Add paneresize event handlers to ngChmContainer elements
	 */
	function addResizeHandlersToContainers() {
		let containers = document.getElementsByClassName("ngChmContainer")
		for (let i=0; i<containers.length; i++) {
			containers[i].addEventListener('paneresize', NgChm.Pane.resizeHandler)
		}
	}

	/**
	 *	For each DOM element with className = 'pane' (presumably reconstructed from mapConfig.json),
	 *	replace the element with a pane created from NgChm.Pane.newPane, so that it has all the 
	 *	features panes should have.
	 */
	function recreateReconstructedPanes() {
		NgChm.DMM.DetailMaps = []
		let panes = document.getElementsByClassName("pane")
		for (let i=0; i<panes.length; i++) {
			let displayedPane = document.getElementById(panes[i].id)
			let newPane = NgChm.Pane.newPane({height: displayedPane.clientHeight+"px", width: displayedPane.clientWidth+"px"}, displayedPane.textContent,
			displayedPane.id)
				displayedPane.parentNode.replaceChild(newPane,displayedPane)
		}
	}

	/**
	 *	For each pane, call the function that adds appropriate content
	 */
	function setPanesContent() {
		let panes = document.getElementsByClassName("pane")
		for (let i=0; i<panes.length; i++) {
			setPaneContent(panes[i].id)
		}
	}

	/**
	 *	Set a pane's content based on 'textContent' attribute
	 *	
	 *	Inputs:
	 *	@param {string} paneid id of pane (e.g. 'pane1')
	 *	
	 */
	function setPaneContent(paneid) {
		let pane = document.getElementById(paneid)
		let customjsPlugins = NgChm.LNK.getPanePlugins(); // plugins from custom.js
		if (pane.textContent.includes("Heat Map Summary")) {
			NgChm.SUM.switchPaneToSummary(NgChm.Pane.findPaneLocation(pane))
		} else if (pane.textContent.includes("Heat Map Detail")) {
			NgChm.DET.switchPaneToDetail(NgChm.Pane.findPaneLocation(pane),false)
		} else {
			try {
				NgChm.LNK.switchPaneToPlugin(NgChm.Pane.findPaneLocation(pane),
					customjsPlugins.filter(pc => pc.name == pane.textContent)[0])
				NgChm.Pane.initializeGearIconMenu(document.getElementById(paneid+'Icon'))
			} catch(err) {
				console.error(err)
				console.error("Specified plugin: ",pane.textContent)
				throw("Error loading plugin")
			}
		}
		NgChm.Pane.resizePane(pane)
	}
})();

