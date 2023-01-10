(function() {
    'use strict';
    NgChm.markFile();

// MatrixManager is responsible for retrieving clustered heat map data.  Heat map
// data is available at different 'zoom' levels - Summary, Ribbon Vertical, Ribbon
// Horizontal, and Full.  To use this code, create MatrixManger by calling the 
// MatrixManager function.  The MatrixManager lets you retrieve a HeatmapData object
// given a heat map name and summary level.  The HeatMapLevel object has various
// attributes of the map including the size an number of tiles the map is broken up 
// into.  getTile() is called on the HeatmapData to get each tile of the data.  Tile
// retrieval is asynchronous so you need to provide a callback that is triggered when
// the tile is retrieved.
//

    // Define Namespace for NgChm MatrixManager
    const MMGR = NgChm.createNS('NgChm.MMGR');

    const UTIL = NgChm.importNS('NgChm.UTIL');
    const FLICK = NgChm.importNS('NgChm.FLICK');
    const MAPREP = NgChm.importNS('NgChm.MAPREP');
    const CFG = NgChm.importNS('NgChm.CFG');

    const CMM = NgChm.importNS('NgChm.CMM');
    const UHM = NgChm.importNS('NgChm.UHM');
    const COMPAT = NgChm.importNS('NgChm.CM');

//For web-based NGCHMs, we will create a Worker process to overlap I/O and computation.
MMGR.webLoader = null;

MMGR.WEB_SOURCE = 'W';
MMGR.LOCAL_SOURCE = 'L';
MMGR.FILE_SOURCE = 'F';

MMGR.Event_INITIALIZED = 'Init';
MMGR.Event_JSON = 'Json';
MMGR.Event_NEWDATA = 'NewData';
MMGR.embeddedMapName= null;
MMGR.localRepository= '/NGCHM';

    function callServlet (verb, url, data) {
	const form = document.createElement("form");
	form.action = url;
	form.method = verb;
	if (data) {
	    const input = document.createElement("textarea");
	    input.name = "configData";
	    input.id = "configData";
	    input.value = data;
	    form.appendChild(input);
	}
	form.style.display = 'none';
	document.body.appendChild(form);
	form.submit();
    }

// Matrix Manager block.
{
    var heatMap = null;

    //Main function of the matrix manager - retrieve a heat map object.
    //mapFile parameter is only used for local file based heat maps.
    //This function is called from a number of places:
    //It is called from UIMGR.onLoadCHM when displaying a map in the NG-CHM Viewer and for embedded NG-CHM maps
    //It is called from displayFileModeCHM (in UIMGR) when displaying a map in the stand-alone NG-CHM Viewer
    //It is called in script in the mda_heatmap_viz.mako file when displaying a map in the Galaxy NG-CHM Viewer
    MMGR.createHeatMap = function createHeatMap (fileSrc, heatMapName, updateCallbacks, mapFile) {
	    heatMap = new MMGR.HeatMap(heatMapName, updateCallbacks, fileSrc, mapFile);
    };

    // Return the current heat map.
    MMGR.getHeatMap = function getHeatMap() {
	return heatMap;
    };
}

//Create a worker thread to request/receive json data and tiles.  Using a separate
//thread allows the large I/O to overlap extended periods of heavy computation.
MMGR.createWebLoader = function (fileSrc) {
	const debug = false;
	const baseURL = getLoaderBaseURL (fileSrc);

	// Define worker script.
//	let wS = `"use strict";`
let	wS = `const debug = ${debug};`;
	wS += `const maxActiveRequests = 2;`; // Maximum number of tile requests that can be in flight concurrently
	wS += `var active = 0;`;              // Number of tile requests in flight
	wS += `const pending = [];`;          // Additional tile requests
	wS += `const baseURL = "${baseURL}";`; // Base URL to prepend to requests.
	wS += `var mapId = "${UTIL.mapId}";`; // Map ID.
	wS += `const mapNameRef = "${UTIL.mapNameRef}";`; // Map name (if specified).

	// Create a function that determines the get tile request.
	// Body of function depends on the fileSrc of the NG-CHM.
	wS += 'function tileURL(job){return baseURL+';
	if (fileSrc === MMGR.WEB_SOURCE) {
		wS += '"GetTile?map=" + mapId + "&datalayer=" + job.layer + "&level=" + job.level + "&tile=" + job.tileName';
	} else {
		// [bmb] Is LOCAL_SOURCE ever used?  ".bin" files were obsoleted years ago.
		wS += 'job.layer+"/"+job.level+"/"+job.tileName+".bin"';
	}
	wS += ";}";

	// The following function is stringified and sent to the web loader.
	function loadTile (job) {
		if (active === maxActiveRequests) {
			pending.push(job);
			return;
		}
		active++;
		const req = new XMLHttpRequest();
		req.open("GET", tileURL(job), true);
		req.responseType = "arraybuffer";
		req.onreadystatechange = function () {
			if (req.readyState == req.DONE) {
				active--;
				if (pending.length > 0) {
					loadTile (pending.shift());
				}
				if (req.status != 200) {
					postMessage({ op: 'tileLoadFailed', job });
				} else {
					// Transfer buffer to main thread.
					postMessage({ op: 'tileLoaded', job, buffer: req.response }, [req.response]);
				}
			}
		};
		req.send();
	}
	wS += loadTile.toString();

	// Create a function that determines the get JSON file request.
	// Body of function depends on the fileSrc of the NG-CHM.
	wS += 'function jsonFileURL(name){return baseURL+';
	if (fileSrc === MMGR.WEB_SOURCE) {
		wS += '"GetDescriptor?map=" + mapId + "&type=" + name';
	} else {
		wS += 'name+".json"';
	}
	wS += ";}";

	// The following function is stringified and sent to the web loader.
	function loadJson (name) {
		const req = new XMLHttpRequest();
		req.open("GET", jsonFileURL(name), true);
		req.responseType = "json";
		req.onreadystatechange = function () {
			if (req.readyState == req.DONE) {
				if (req.status != 200) {
					postMessage({ op: 'jsonLoadFailed', name });
				} else {
					// Send json to main thread.
					postMessage({ op:'jsonLoaded', name, json: req.response });
				}
			}
		};
		req.send();
	};
	wS += loadJson.toString();

	// This function will be stringified and sent to the web loader.
	function handleMessage(e) {
		if (debug) console.log({ m: 'Worker: got message', e, t: performance.now() });
		if (e.data.op === 'loadTile') { loadTile (e.data.job); }
		else if (e.data.op === 'loadJSON') { loadJson (e.data.name); }
	}
	wS += handleMessage.toString();

	// This function will be stringified and sent to the web loader.
	function getConfigAndData() {
		// Retrieve all map configuration data.
		loadJson('mapConfig');
		// Retrieve all map supporting data (e.g. labels, dendros) from JSON.
		loadJson('mapData');
	}
	wS += getConfigAndData.toString();

	// If the map was specified by name, send the code to find the
	// map's id by name.  Otherwise just get the map's config
	// and data.
	if (UTIL.mapId === '' && UTIL.mapNameRef !== '') {
		function getMapId () {
			fetch (baseURL + "GetMapByName/" + mapNameRef)
			.then (res => {
				if (res.status === 200) {
					res.json().then (mapinfo => {
						mapId = mapinfo.data.id;
						getConfigAndData();
					});
				} else {
					postMessage({ op: 'jsonLoadFailed', name: 'GetMapByName' });
				}
			});
		}
		wS += getMapId.toString();
		wS += getMapId.name + '();';
	} else {
		wS += getConfigAndData.name + '();';
	}

	wS += `onmessage = ${handleMessage.name};`;
	if (debug) wS += `console.log ({ m:'TileLoader loaded', t: performance.now() });`;

	// Create blob and start worker.
	const blob = new Blob([wS], {type: 'application/javascript'});
	if (debug) console.log({ m: 'MMGR.createWebLoader', blob, wS });
	MMGR.webLoader = new Worker(URL.createObjectURL(blob));
	// It is possible for the web worker to post a reply to the main thread
	// before the message handler is defined.  Stash any such messages away
	// and play them back once it has been.
	const pendingMessages = [];
	MMGR.webLoader.onmessage = function(e) {
		pendingMessages.push(e);
	};
	MMGR.webLoader.setMessageHandler = function (mh) {
		// Run asychronously so that the heatmap can be defined before processing messages.
		setTimeout(function() {
		    while (pendingMessages.length > 0) {
			    mh (pendingMessages.shift());
		    }
		    MMGR.webLoader.onmessage = mh;
		}, 0);
	};

	// Called locally.
	function getLoaderBaseURL (fileSrc) {
		var URL;
		if (fileSrc == MMGR.WEB_SOURCE) {
			// Because a tile worker thread doesn't share our origin, we have to pass it
			// an absolute URL, and to substitute in the CFG.api variable, we want to
			// build the URL using the same logic as a browser for relative vs. absolute
			// paths.
			URL = document.location.origin;
			if (CFG.api[0] !== '/') {	// absolute
				URL += '/' + window.location.pathname.substr(1, window.location.pathname.lastIndexOf('/'));
			}
			URL += CFG.api;
		} else {
			console.log (`getLoaderBaseURL: fileSrc==${fileSrc}`);
			URL = MMGR.localRepository+"/"+MMGR.embeddedMapName+"/";
		}
		return URL;
	}
};

MMGR.isRow = function isRow (axis) {
	return axis && axis.toLowerCase() === 'row';
};

//HeatMap Object - holds heat map properties and a tile cache
//Used to get HeatMapLevel object.
//ToDo switch from using heat map name to blob key?
MMGR.HeatMap = function(heatMapName, updateCallbacks, fileSrc, chmFile) {
	//This holds the various zoom levels of data.
	var mapConfig = null;
	var mapData = null;
	var mapUpdatedOnLoad = false; // Set to true if map updated on load.
	var datalevels = {};
	const alternateLevels = {};	
	var tileCache = {};
	var zipFiles = {};
	var colorMapMgr;
	var initialized = 0;
	const eventListeners = updateCallbacks.slice(0);  // Create a copy.
	var flickInitialized = false;
	var unAppliedChanges = false;
	const jsonSetterFunctions = [];

	const isRow = MMGR.isRow;

	// Return the source of this heat map.
	this.source = function() {
	    return fileSrc;
	};

	// Method used to register another callback function for a user that wants to be notifed
	// of updates to the status of heat map data.
	this.addEventListener = function(callback) {
	    eventListeners.push(callback.bind (this));
	};

	// Functions for getting and setting the data layer of this heat map
	// currently being displayed.
	// Set in the application by the user when, for exanple, flick views are toggled.
	{
	    this._currentDl = "dl1"; // Set default to Data Layer 1.

	    this.setCurrentDL = function (dl) {
		// Set the current data layer to dl.
		// If the current data layer changes, the colors used for
		// highlighting labels etc. will be automatically
		// updated.  The colors of heat map views etc. will
		// not be updated here.
		if (this._currentDl != dl) {
		    this._currentDl = dl;
		    this.setSelectionColors();
		}
	    };

	    this.getCurrentDL = function (dl) {
		return this._currentDl;
	    };
	}

	/********************************************************************************************
	 * FUNCTION:  getCurrentColorMap - Get the color map for the heat map's current data layer.
	 ********************************************************************************************/
	this.getCurrentColorMap = function () {
	    return this.getColorMapManager().getColorMap("data", this.getCurrentDL());
	};

	/*********************************************************************************************
	 * FUNCTION:  setSelectionColors - Set the colors for selected labels based on the
	 * current layer's color scheme.
	 *********************************************************************************************/
	this.setSelectionColors = function () {
	    const colorMap = this.getColorMapManager().getColorMap("data",this._currentDl);
	    const dataLayer = this.getDataLayers()[this._currentDl];
	    const selColor = colorMap.getHexToRgba(dataLayer.selection_color);
	    const textColor = colorMap.isColorDark(selColor) ? "#000000" : "#FFFFFF";
	    const root = document.documentElement;
	    root.style.setProperty('--in-selection-color', textColor);
	    root.style.setProperty('--in-selection-background-color', dataLayer.selection_color);
	};

	this.getMapConfig = function() {
	    return mapConfig;
	};

	this.isMapLoaded = function () {
		return mapConfig !== null;
	};
	
	this.isFileMode = function () {
	    return this.source() === MMGR.FILE_SOURCE;
	};
	
	this.isReadOnly = function(){
		return mapConfig.data_configuration.map_information.read_only === 'Y';
	};
	
	this.setUnAppliedChanges = function(value){
		unAppliedChanges = value;
		return;
	}
	
	this.getUnAppliedChanges = function(){
		return unAppliedChanges;
	}
	
	//Return the total number of detail rows
	this.getTotalRows = function(){
		return datalevels[MAPREP.DETAIL_LEVEL].totalRows;
	}
	
	//Return the summary row ratio
	this.getSummaryRowRatio = function(){
		if (datalevels[MAPREP.SUMMARY_LEVEL] !== null) {
			return datalevels[MAPREP.SUMMARY_LEVEL].rowSummaryRatio;
		} else {
			return datalevels[MAPREP.THUMBNAIL_LEVEL].rowSummaryRatio;
		}
	}
	
	//Return the summary row ratio
	this.getSummaryColRatio = function(){
		if (datalevels[MAPREP.SUMMARY_LEVEL] !== null) {
			return datalevels[MAPREP.SUMMARY_LEVEL].colSummaryRatio;
		} else {
			return datalevels[MAPREP.THUMBNAIL_LEVEL].col_summaryRatio;
		}
	}
	//Return the total number of detail rows
	this.getTotalRows = function(){
		return datalevels[MAPREP.DETAIL_LEVEL].totalRows;
	}
	
	this.setFlickInitialized = function(value){
		flickInitialized = value;
	}
	
	//Return the total number of detail rows
	this.getTotalCols = function(){
		return datalevels[MAPREP.DETAIL_LEVEL].totalColumns;
	}
	
	//Return the total number of rows/columns on the specified axis.
	this.getTotalElementsForAxis = function(axis) {
		const level = datalevels[MAPREP.DETAIL_LEVEL];
		return isRow(axis) ? level.totalRows : level.totalColumns;
	};

	//Return the number of rows for a given level
	this.getNumRows = function(level){
		return datalevels[level].totalRows;
	}
	
	//Return the number of columns for a given level
	this.getNumColumns = function(level){
		return datalevels[level].totalColumns;
	}
	
	//Return the row summary ratio for a given level
	this.getRowSummaryRatio = function(level){
		return datalevels[level].rowSummaryRatio;
	}
	
	//Return the column summary ratio for a given level
	this.getColSummaryRatio = function(level){
		return datalevels[level].colSummaryRatio;
	}
	
	//Get a data value in a given row / column
	this.getValue = function(level, row, column) {
		return datalevels[level].getLayerValue(this._currentDl,row,column);
	}
	
	// Retrieve color map Manager for this heat map.
	this.getColorMapManager = function() {
		if (mapConfig == null)
			return null;
		
		if (colorMapMgr == null ) {
			colorMapMgr = new CMM.ColorMapManager(this, mapConfig);
		}
		return colorMapMgr;
	}
	
	this.getAxisConfig = function(axis) {
		return axis.toUpperCase() === "ROW" ? this.getRowConfig() : this.getColConfig();
	};

	this.getRowConfig = function() {
		return mapConfig.row_configuration;
	}
	
	this.getColConfig = function() {
		return mapConfig.col_configuration;
	}
	
	this.getAxisCovariateConfig = function (axis) {
		return this.getAxisConfig(axis).classifications;
	}

	this.getAxisCovariateOrder = function (axis) {
		return isRow(axis) ? this.getRowClassificationOrder() : this.getColClassificationOrder();
	};

	this.getAxisCovariateData = function (axis) {
		return isRow(axis) ? mapData.row_data.classifications : mapData.col_data.classifications;
	};
	
	this.getRowClassificationConfig = function() {
		return mapConfig.row_configuration.classifications;
	}
	
	this.getRowClassificationConfigOrder = function() {
		return mapConfig.row_configuration.classifications_order;
	}
	
	this.getColClassificationConfig = function() {
		return mapConfig.col_configuration.classifications;
	}
	
	this.getColClassificationConfigOrder = function() {
		return mapConfig.col_configuration.classifications_order;
	}
	
	// Return an array of the display types of all covariate bars on an axis.
	// Hidden bars have a height of zero.  The order of entries is fixed but not
	// specified.
	this.getCovariateBarTypes = function (axis) {
		return Object.entries(this.getAxisCovariateConfig(axis))
		.map(([key,config]) => config.show === 'Y' ? (config.bar_type) : 0)
	}

	// Return an array of the display parameters of all visible covariate bars on an axis.
	// Hidden bars have no parameters.  The order of entries is fixed but not
	// specified.
	this.getCovariateBarParams = function (axis) {
	    return Object.entries(this.getAxisCovariateConfig(axis))
	    .map(([key,config]) => config.show === 'Y' ? barParams(config) : {})
	};

	function barParams (config) {
	    if (config.bar_type == 'color_plot') {
		return { color_map: config.color_map };
	    } else {
		return { bg_color: config.bg_color, fg_color: config.fg_color, low_bound: config.low_bound, high_bound: config.high_bound };
	    }
	}

	this.getRowClassificationOrder = function(showOnly) {
		var rowClassBarsOrder = mapConfig.row_configuration.classifications_order;
		// If configuration not found, create order from classifications config
		if (typeof rowClassBarsOrder === 'undefined') {
			rowClassBarsOrder = [];
			for (key in mapConfig.row_configuration.classifications) {
				rowClassBarsOrder.push(key);
			}
		}
		// Filter order for ONLY shown bars (if requested)
		if (typeof showOnly === 'undefined') {
			return rowClassBarsOrder;
		} else {
			const filterRowClassBarsOrder = [];
			for (var i = 0; i < rowClassBarsOrder.length; i++) {
				var newKey = rowClassBarsOrder[i];
				var currConfig = mapConfig.row_configuration.classifications[newKey];
				if (currConfig.show == "Y") {
					filterRowClassBarsOrder.push(newKey);
				}
			}
			return filterRowClassBarsOrder;
		}
	}
	
	this.setRowClassificationOrder = function() {
		if (mapConfig !== null) {mapConfig.row_configuration.classifications_order = this.getRowClassificationOrder();}
	}
	
	this.getColClassificationOrder = function(showOnly){
		var colClassBarsOrder = mapConfig.col_configuration.classifications_order;
		// If configuration not found, create order from classifications config
		if (typeof colClassBarsOrder === 'undefined') {
			colClassBarsOrder = [];
			for (key in mapConfig.col_configuration.classifications) {
				colClassBarsOrder.push(key);
			}
		}
		// Filter order for ONLY shown bars (if requested)
		if (typeof showOnly === 'undefined') {
			return colClassBarsOrder;
		} else {
			const filterColClassBarsOrder = [];
			for (var i = 0; i < colClassBarsOrder.length; i++) {
				var newKey = colClassBarsOrder[i];
				var currConfig = mapConfig.col_configuration.classifications[newKey];
				if (currConfig.show == "Y") {
					filterColClassBarsOrder.push(newKey);
				}
			}
			return filterColClassBarsOrder;
		}
	}

	const transparent = { 'r': 0, 'g': 0, 'b': 0, 'a': 0 };
	const white = CMM.hexToRgba("#FFFFFF");
	class VisibleCovariateBar {

	    constructor (key, details, scale) {
		Object.assign (this, details, { label: key, height: (details.height * scale) | 0 });
	    }

	    // Return an array of colors to use when creating scatter or bar plots.
	    // The order of the colors matches the matrix values produced by SUM.buildScatterBarPlotMatrix.
	    // Specifically:
	    // [0] Background color
	    // [1] Foreground color
	    // [2] Cuts color
	    getScatterBarPlotColors () {
		const fgColor = CMM.hexToRgba (this.fg_color);
		const bgColor = this.subBgColor === "#FFFFFF" ? transparent : CMM.hexToRgba(this.bg_color);
		return [ bgColor, fgColor, white ];
	    }
	}

	/* Returns an array of the visible covariates on the specified axis of the heat map.
	 * The height of each covariable is scaled by scale.
	 *
	 * The returned array has two additional methods:
	 * - totalHeight, which returns the total height of all bars in the array
	 * - containsLegend, which returns true iff there's a bar with a bar/scatter plot legend.
	 */
	this.getScaledVisibleCovariates = function (axis, scale) {
	    const axisConfig = isRow (axis) ? mapConfig.row_configuration : mapConfig.col_configuration;
	    const order = axisConfig.hasOwnProperty('classifications_order') ? axisConfig.classifications_order : Object.keys(axisConfig.classifications);
	    const bars = order.map (key => new VisibleCovariateBar (key, axisConfig.classifications[key], scale)).filter (bar => bar.show === 'Y');
	    Object.defineProperty (bars, 'totalHeight', {
	        value: totalHeight,
		enumerable: false
	    });
	    Object.defineProperty (bars, 'containsLegend', {
	        value: containsLegend,
		enumerable: false
	    });
	    return bars;

	    function totalHeight () {
		return this.map (bar => bar.height).reduce((t,h) => t+h, 0);
	    }

	    function containsLegend () {
		return this.filter (bar => bar.bar_type !== 'color_plot').length > 0;
	    }
	};
	
	/* Returns true iff there are hidden covariates on the specified axis of the heat map.
	 */
	this.hasHiddenCovariates = function (axis) {
	    const axisConfig = isRow (axis) ? mapConfig.row_configuration : mapConfig.col_configuration;
	    const order = axisConfig.hasOwnProperty('classifications_order') ? axisConfig.classifications_order : Object.keys(axisConfig.classifications);
	    return order.map (key => axisConfig.classifications[key].show).filter (show => show !== 'Y').length > 0;
	};

	this.setColClassificationOrder = function() {
		if (mapConfig !== null) {mapConfig.col_configuration.classifications_order = this.getColClassificationOrder();}
	}
	
	this.getRowClassificationData = function() {
		return mapData.row_data.classifications;
	}
	
	this.getColClassificationData = function() {
		return mapData.col_data.classifications;
	}
	
	this.getMapInformation = function() {
		return mapConfig.data_configuration.map_information;
	}
	
	this.getDataLayers = function() {
		return mapConfig.data_configuration.map_information.data_layer;
	}

	this.getCurrentDataLayer = function() {
		return this.getDataLayers()[this.getCurrentDL()];
	};

	this.getDividerPref = function() {
		return mapConfig.data_configuration.map_information.summary_width;
	}

	this.setDividerPref = function(sumSize) {
		var sumPercent = 50;
		if (sumSize === undefined) {
			var container = document.getElementById('ngChmContainer');
			var summary = document.getElementById('summary_chm');
			sumPercent = Math.ceil(100*summary.clientWidth / container.clientWidth);
		} else {
			sumPercent = sumSize;
		}
		mapConfig.data_configuration.map_information.summary_width = sumPercent;
		mapConfig.data_configuration.map_information.detail_width = 100 - sumPercent;
	}
	
	this.setClassificationPrefs = function(classname, type, showVal, heightVal) {
		if (type === "row") {
			mapConfig.row_configuration.classifications[classname].show = showVal ? 'Y' : 'N';
			mapConfig.row_configuration.classifications[classname].height = parseInt(heightVal);
		} else {
			mapConfig.col_configuration.classifications[classname].show = showVal ? 'Y' : 'N';
			mapConfig.col_configuration.classifications[classname].height = parseInt(heightVal);
		}
	}
	
	this.setClassBarScatterPrefs = function(classname, type, barType, lowBound, highBound, fgColorVal, bgColorVal) {
		if (type === "row") {
			mapConfig.row_configuration.classifications[classname].bar_type = barType;
			if (typeof lowBound !== 'undefined') {
				mapConfig.row_configuration.classifications[classname].low_bound = lowBound;
				mapConfig.row_configuration.classifications[classname].high_bound = highBound;
				mapConfig.row_configuration.classifications[classname].fg_color = fgColorVal;
				mapConfig.row_configuration.classifications[classname].bg_color = bgColorVal;
			}
		} else {
			mapConfig.col_configuration.classifications[classname].bar_type = barType;
			if (typeof lowBound !== 'undefined') {
				mapConfig.col_configuration.classifications[classname].low_bound = lowBound;
				mapConfig.col_configuration.classifications[classname].high_bound = highBound;
				mapConfig.col_configuration.classifications[classname].fg_color = fgColorVal;
				mapConfig.col_configuration.classifications[classname].bg_color = bgColorVal;
			}
		}
	}

	this.setLayerGridPrefs = function(key, showVal, gridColorVal, selectionColorVal, gapColorVal) {
		mapConfig.data_configuration.map_information.data_layer[key].grid_show = showVal ? 'Y' : 'N';
		mapConfig.data_configuration.map_information.data_layer[key].grid_color = gridColorVal;
		mapConfig.data_configuration.map_information.data_layer[key].cuts_color = gapColorVal;
		mapConfig.data_configuration.map_information.data_layer[key].selection_color = selectionColorVal;
		if (key == this.getCurrentDL()) {
		    this.setSelectionColors ();
		}
	}
	
	//Get Row Organization
	this.getRowOrganization = function() {
		return mapConfig.row_configuration.organization;
	}
	
	//Get Axis Labels
	this.getAxisLabels = function(axis) {
		return axis.toUpperCase() === 'ROW' ? mapData.row_data.label : mapData.col_data.label;
	};

	//Get Row Labels
	this.getRowLabels = function() {
		return mapData.row_data.label;
	}
	
	//Get Column Organization
	this.getColOrganization = function() {
		return mapConfig.col_configuration.organization;
	}
	
	//Get Column Labels
	this.getColLabels = function() {
		return mapData.col_data.label;
	}
	
	//Get map information config data
	this.getMapInformation = function() {
		return mapConfig.data_configuration.map_information; 
	}

	// Get panel configuration from mapConfig.json
	this.getPanelConfiguration = function() {
		return mapConfig.panel_configuration;
	}

	this.getRowDendroConfig = function() {
		return mapConfig.row_configuration.dendrogram;
	}
	
	this.getColDendroConfig = function() {
		return mapConfig.col_configuration.dendrogram;
	}
	
	this.getRowDendroData = function() {
		return parseDendroData (mapData.row_data.dendrogram);
	}
	
	this.getColDendroData = function() {
		return parseDendroData (mapData.col_data.dendrogram);
	}
	
	this.setRowDendrogramShow = function(value) {
		mapConfig.row_configuration.dendrogram.show = value;
	}
	
	this.setColDendrogramShow = function(value) {
		mapConfig.col_configuration.dendrogram.show = value;
	}
	
	this.setRowDendrogramHeight = function(value) {
		mapConfig.row_configuration.dendrogram.height = value;
	}
	
	this.setColDendrogramHeight = function(value) {
		mapConfig.col_configuration.dendrogram.col_dendro_height = value;
	}
	
	this.showRowDendrogram = function(layer) {
		var showDendro = true;
		var showVal = mapConfig.row_configuration.dendrogram.show;
		if ((showVal === 'NONE') || (showVal === 'NA')) {
			showDendro = false;
		}
		if ((layer === 'DETAIL') && (showVal === 'SUMMARY')) {
			showDendro = false;
		}
		return showDendro;
	}

	this.showColDendrogram = function(layer) {
		var showDendro = true;
		var showVal = mapConfig.col_configuration.dendrogram.show;
		if ((showVal === 'NONE') || (showVal === 'NA')) {
			showDendro = false;
		}
		if ((layer === 'DETAIL') && (showVal === 'SUMMARY')) {
			showDendro = false;
		}
		return showDendro;
	}

	this.setReadOnly = function() {
	    mapConfig.data_configuration.map_information.read_only = 'Y';
	};

	// Array of TileWindow onready functions waiting for all tiles in the
	// window to load.
	this.tileWindowListeners = [];
	this.tileWindowRefs = new Map();

	// Listen for tile load notifications.  For each, check each TileWindow
	// listener to see if all required tiles have been received.
	//
	// This approach uses a single permanent event listener for the entire
	// heatMap.  Currently there is no way to remove 'transient' event
	// listeners, such as TileWindow listeners.
	this.addEventListener(function (event, tile) {
	    if (event == MMGR.Event_NEWDATA) {
		// Iterate over all the tileWindowRefs, remove any that have been reclaimed,
		// and check all others for tile updates.
		this.tileWindowRefs.forEach ((value, key) => {
		    const tileWin = value.deref();
		    if (tileWin) {
			tileWin.checkTile (tile);
		    } else {
			console.log ('Removing garbage collected tileWindow', key);
			this.tileWindowRefs.delete(key);
		    }
		});
		// Iterate over all the tileWindowListeners.
		let i = 0;
		while (i < this.tileWindowListeners.length) {
		    const entry = this.tileWindowListeners[i];
		    // Check if all tiles in the window are now available
		    // and the listener's onready promise has been resolved.
		    if (entry.checkReady(entry.tileWindow, tile)) {
			// If so, delete the entry.
			this.tileWindowListeners.splice (i, 1);
		    } else {
			// Otherwise, advance to next entry.
			i ++;
		    }
		}
	    }
	});


	// A helper class for the tiles required by an access window.
	class TileWindow {
	    #allTilesAvailable;
	    #tileStatusValid;
	    constructor (heatMap, layer, level, startRowTile, endRowTile, startColTile, endColTile) {
		this.heatMap = heatMap;
		this.layer = layer;
		this.level = level;
		this.startRowTile = startRowTile;
		this.endRowTile = endRowTile;
		this.startColTile = startColTile;
		this.endColTile = endColTile;

		this.#allTilesAvailable = false;
		this.#tileStatusValid = false;
	    }

	    checkTile (tile) {
		if (tile.layer === this.layer && tile.level === this.level &&
			tile.row >= this.startRowTile && tile.row <= this.endRowTile &&
			tile.col >= this.startColTile && tile.col <= this.endColTile) {
		    console.log ('checkTile: tile in TileWindow', tile);
		    this.#tileStatusValid = false;
		}
	    }

	    fetchTiles () {
		for (let i = this.startRowTile; i <= this.endRowTile; i++) {
		    for (let j = this.startColTile; j <= this.endColTile; j++) {
			getTile(this.layer, this.level, i, j);
		    }
		}
	    }

	    allTilesAvailable () {
		if (this.#tileStatusValid) {
		    return this.#allTilesAvailable;
		}
		for (let i = this.startRowTile; i <= this.endRowTile; i++) {
		    for (let j = this.startColTile; j <= this.endColTile; j++) {
			const tileCacheName = this.layer + "." + this.level + "." + i + "." + j;
			if (getTileCacheData(tileCacheName) === null) {
			    this.#allTilesAvailable = false;
			    this.#tileStatusValid = true;
			    return false;
			}
		    }
		}
		this.#allTilesAvailable = true;
		this.#tileStatusValid = true;
		return true;
	    }

	    // This method waits until all tiles in the tilewindow are available.
	    //
	    // If callback is undefined, onready returns a promise that
	    // resolves when all tiles in the TileWindow are available.
	    //
	    // If callback is defined, onready returns undefined and calls callback
	    // when all tiles in the TileWindow are available.
	    //
	    // The TileWindow is passed to callback or is the result of the Promise.
	    //
	    // NB: Currently, tiles are never expunged from the cache.
	    // If they ever can be, there will need to be a way to prevent
	    // tiles from being expunged while a TileWindow is interested in them.
	    // Perhaps something as simple as preventing expunging while
	    // the tileWindowListeners array is non-empty.
	    onready (callback) {
		const p = new Promise((resolve, reject) => {
		    if (this.allTilesAvailable()) {
			resolve(this);
		    } else {
			this.heatMap.tileWindowListeners.push ({ tileWindow: this, checkReady: checkReady, });
		    }

		    function checkReady (tileWindow, tile) {
			// First two conditions below are optimizations: only tiles for tileWindow's layer & level can
			// affect its allTilesAvailable.  Saves a potentially large nested loop.
			if (tile.layer == tileWindow.layer && tile.level == tileWindow.level && tileWindow.allTilesAvailable()) {
			    // Resolve promise and remove entry from
			    // tileWindowListeners.
			    resolve(tileWindow);
			    return true;
			}
			// Keep listening.
			return false;
		    }
		});
		if (callback) {
		    // Callback provided: call it when the Promise resolves.
		    p.then(callback);
		} else {
		    // No callback: return Promise.
		    return p;
		}
	    }
	}

	// Create a TileWindow for the specified heatMap and view window.
	function getTileWindow (heatMap, win) {
	    return datalevels[win.level].getTileAccessWindow (win.firstRow, win.firstCol, win.numRows, win.numCols, (level, startRowTile, endRowTile, startColTile, endColTile) => {
		const tileKey = JSON.stringify({ layer: win.layer, level, startRowTile, endRowTile, startColTile, endColTile });
		if (heatMap.tileWindowRefs.has (tileKey)) {
		    const tileRef = heatMap.tileWindowRefs.get(tileKey).deref();
		    if (tileRef) {
			//console.log ('Found existing tileWindow for ', tileKey);
			return tileRef;
		    }
		    console.log ('Encountered garbage collected tileWindow for ', tileKey);
		}
		// Create a new tileWindow and keep a weak reference to it.
		//console.log ('Creating new tileWindow for ', tileKey);
		const tileRef = new TileWindow (heatMap, win.layer, level, startRowTile, endRowTile, startColTile, endColTile);
		heatMap.tileWindowRefs.set (tileKey, new WeakRef(tileRef));
		return tileRef;
	    });
	};

	class AccessWindow {
	    constructor (heatMap, win) {
		this.heatMap = heatMap;
		this.win = { layer: win.layer, level: win.level, firstRow: win.firstRow|0, firstCol: win.firstCol|0, numRows: win.numRows|0, numCols: win.numCols|0 };
		this.tileWindow = getTileWindow (heatMap, this.win);
		this.tileWindow.fetchTiles();
		this.datalevel = datalevels[this.win.level];
	    }

	    getValue (row, column) {
		return this.datalevel.getLayerValue (this.win.layer, row|0, column|0);
	    }

	    onready (callback) {
		const p = this.tileWindow.onready();
		if (callback) {
		    p.then(() => callback (this));
		} else {
		    return p.then(() => this);
		}
	    }
	}

	/* Obtain an access window for the specified view window.
	 * The access window contains three entries:
	 * - win: The view window.
	 * - getValue (row, column) Function to return the value at row, column in heatMap coordinates.
	 * - onready (callback) When all data ready, call callback if specified with the access window as its parameter or return a promise for the access window.  
	 *
	 * The returned access window will have its data tiles requested, but they may not be available immediately.
	 * Use the onready method to request a promise/callback when all tiles in the access window are ready.
	 */
	this.getNewAccessWindow = function (win) {
	    return new AccessWindow (this, win);
	};

	//Is the heat map ready for business 
	this.isInitialized = function() {
		return initialized;
	}

	this.configureFlick = function(){
		if (!flickInitialized) {
			const dl = this.getDataLayers();
			const numLayers = Object.keys(dl).length;
			let maxDisplay = 0;
			if (numLayers > 1) {
				const dls = new Array(numLayers);
				const orderedKeys = new Array(numLayers);
				for (let key in dl){
					const dlNext = +key.substring(2, key.length);
					orderedKeys[dlNext-1] = key;
					let displayName = dl[key].name;
					if (displayName.length > maxDisplay) {
						maxDisplay = displayName.length;
					}
					if (displayName.length > 20) {
						displayName = displayName.substring(0,17) + "...";
					}
					dls[dlNext-1] = '<option value="'+key+'">'+displayName+'</option>';
				}
				FLICK.enableFlicks (dls.join(""), this.getCurrentDL(), orderedKeys[1]);
			} else {
				this.setCurrentDL("dl1");
				FLICK.disableFlicks();
			}
			flickInitialized = true;

			var gearBtnPanel = document.getElementById("pdf_gear");
			if (maxDisplay > 15) {
				gearBtnPanel.style.minWidth = '320px';
			} else if (maxDisplay === 0) {
				gearBtnPanel.style.minWidth = '80px';
			} else {	
				gearBtnPanel.style.minWidth = '250px';
			}
			
		}
	}

	
	//************************************************************************************************************
	//
	// Internal Heat Map Functions.  Users of the heat map object don't need to use / understand these.
	//
	//************************************************************************************************************
	
	//Initialization - this code is run once when the map is created.
	
	if (fileSrc !== MMGR.FILE_SOURCE) {
		if (fileSrc !== MMGR.WEB_SOURCE) createWebLoader(fileSrc);
		connectWebLoader(fileSrc);
	} else {
		//Check file mode viewer software version (excepting when using embedded widget)
		if (typeof embedDiv === 'undefined') {
			fileModeFetchVersion();
		}
		if (chmFile.size === 0) {
			UHM.mapLoadError (chmFile.name, "File is empty (zero bytes)");
			return;
		}
		//fileSrc is file so get the JSON files from the zip file.
		//First create a dictionary of all the files in the zip.
		var zipBR = new zip.BlobReader(chmFile);
		zip.createReader(zipBR, function(reader) {
			// get all entries from the zip
			reader.getEntries(function(entries) {
				//Inspect the first entry path to grab the true heatMapName.
				//The user may have renamed the zip file OR it was downloaded
				//as a second+ generation of a file by the same name (e.g. with a " (1)" 
				//in the name).
			        if (entries.length == 0) {
				    UHM.mapLoadError (chmFile.name, "Empty zip file");
				    return;
				}
				const entryName = entries[0].filename;
				const slashIdx = entryName.indexOf("/");
				if (slashIdx < 0) {
				    UHM.mapLoadError (chmFile.name, "File format not recognized");
				    return;
				}
				heatMapName = entryName.substring(0,slashIdx);
				for (var i = 0; i < entries.length; i++) {
					zipFiles[entries[i].filename] = entries[i];
				}
				const mapConfigName = heatMapName + "/mapConfig.json";
				const mapDataName = heatMapName + "/mapData.json";
				if ((mapConfigName in zipFiles) && (mapDataName in zipFiles)) {
				    zipFetchJson(zipFiles[mapConfigName], addMapConfig);
				    zipFetchJson(zipFiles[mapDataName], addMapData);
				} else {
				    UHM.mapLoadError (chmFile.name, "Missing NGCHM content");
				}
			});
		}, function(error) {
			console.log('Zip file read error ' + error);
			UHM.mapLoadError (chmFile.name, error);
		});	
	}
	
	// Parse dendrogram data.
	function parseDendroData (data) {
		return (data || [])
		.map(entry => {
			const tokes = entry.split(",");
			return { left: Number(tokes[0]), right: Number(tokes[1]), height: Number(tokes[2]) };
		});
	}
	
	/**
	* Save data sent to plugin to mapConfig 
	*/
	MMGR.saveDataSentToPluginToMapConfig = function(nonce, postedConfig, postedData) {
		try {
			var pane = document.querySelectorAll('[data-nonce="'+nonce+'"]')[0].parentElement.parentElement
		} catch(err) {
			throw "Cannot determine pane for given nonce"
			return false
		}
		const paneId = pane.id;
		if (!mapConfig.hasOwnProperty('panel_configuration')) { 
			mapConfig['panel_configuration'] = {} 
		}
		if (!mapConfig.panel_configuration.hasOwnProperty(paneId) || mapConfig.panel_configuration[paneId] == null) { 
			mapConfig.panel_configuration[paneId] = {} 
		}
		if (postedConfig) mapConfig.panel_configuration[paneId].config = postedConfig;
		if (postedData) mapConfig.panel_configuration[paneId].data = postedData;
		mapConfig.panel_configuration[paneId].type = 'plugin';
		mapConfig.panel_configuration[paneId].pluginName = pane.dataset.pluginName;
	}

	MMGR.removePaneInfoFromMapConfig = function(paneid) {
		if (mapConfig.hasOwnProperty('panel_configuration')) {
			mapConfig.panel_configuration[paneid] = null;
		}
	}

	/**
	* Save linkout pane data to mapConfig
	*/
	MMGR.saveLinkoutPaneToMapConfig = function(paneid, url, paneTitle) {
		if (!mapConfig.hasOwnProperty('panel_configuration')) { 
			mapConfig['panel_configuration'] = {} 
		}
		mapConfig.panel_configuration[paneid] = {
			'type': 'linkout',
			'url': url,
			'paneTitle': paneTitle
		} 
	}

	/*
	  Saves data from plugin to mapConfig--this is data that did NOT originally come from the NGCHM.
	*/
	MMGR.saveDataFromPluginToMapConfig = function(nonce, dataFromPlugin) {
		try {
			var paneId = document.querySelectorAll('[data-nonce="'+nonce+'"]')[0].parentElement.parentElement.id;
		} catch(err) {
			throw "Cannot determine pane for given nonce";
			return false;
		}
		if (!mapConfig.hasOwnProperty('panel_configuration')) { 
			mapConfig['panel_configuration'] = {};
		}
		if (!mapConfig.panel_configuration.hasOwnProperty(paneId) || mapConfig.panel_configuration[paneId] == null) { 
			mapConfig.panel_configuration[paneId] = {};
		}
		mapConfig.panel_configuration[paneId].dataFromPlugin = dataFromPlugin;
	}

	this.zipSaveMapProperties = zipSaveMapProperties;
	function zipSaveMapProperties(mapConf) {

		  function onProgress(a, b) {
			  // For debug use - console.log("current", a, "end", b);
		  }

		  var zipper = (function buildZipFile() {
		    var zipWriter;

		    return {
		      addTexts : function addEntriesToZipFile(callback) {
					// Loop thru all entries in zipFiles, adding them to the new zip file.
			    	function add(fileIndex) {
						var zipLen = Object.keys(zipFiles).length;
						var keyVal = Object.keys(zipFiles)[fileIndex];
						var entry = zipFiles[keyVal];
						if (fileIndex < zipLen) {
							if ((keyVal.indexOf('bin') < 0) && (keyVal.indexOf('tile') < 0)) {
								// Directly add all text zip entries directly to the new zip file
								// except for mapConfig.  For this entry, add the modified config data.
								if (keyVal.indexOf('mapConfig') > -1) {
									addTextContents(entry.filename, fileIndex, JSON.stringify(mapConf || mapConfig));
								} else {
									zipFetchText(entry, fileIndex, addTextContents);
								}
							} else {
								// Directly add all binary zip entries directly to the new zip file
								zipFetchBin(entry, fileIndex, addBinContents);
							}
						} else {
						  callback() /* [2] no more files to add: callback is called */;
						}
			        }
					// Get the text data for a given zip entry and execute the 
					// callback to add that data to the zip file.
					function zipFetchText(entry, fileIndex, setterFunction) {
						entry.getData(new zip.TextWriter(), function(text) {
							// got the json, now call the appropriate setter
							setterFunction(entry.filename, fileIndex, text);
						}, function(current, total) {
							// onprogress callback
						});
					}
					// Get the binary data for a given zip entry and execute the 
					// callback to add that data to the zip file.
			    	function zipFetchBin(entry, fileIndex, setterFunction) {
						entry.getData(new zip.BlobWriter(), function(blob) {
			    			setterFunction(entry.filename, fileIndex, blob);
						}, function(current, total) {
							// onprogress callback
						});		
			    	}
					// Add text contents to the zip file and call the add function 
					// to process the next zip entry stored in zipFiles.
			        function addTextContents(name, fileIndex, contents) {
		                zipWriter.add(name, new zip.TextReader(contents), function() {
			                add(fileIndex + 1); /* [1] add the next file */
			              }, onProgress);
			        }
					// Add binary contents to the zip file and call the add function 
					// to process the next zip entry stored in zipFiles.
			        function addBinContents(name, fileIndex, contents) {
		                zipWriter.add(name, new zip.BlobReader(contents), function() {
			                add(fileIndex + 1); /* [1] add the next file */
			              }, onProgress);
			        }
			      // Start the zip file creation process by instantiating a writer
			      // and calling the add function for the first entry in zipFiles.
		          zip.createWriter(new zip.BlobWriter(), function(writer) {
		            zipWriter = writer;
		            add(0); /* [1] add the first file */
		          });
		      },
		      getBlob : function(callback) {
		        zipWriter.close(callback);
		      }
		    };
		  })();

		  zipper.addTexts(function addTextsCallback() {
		    zipper.getBlob(function getBlobCallback(blob) {
		      saveAs(blob, heatMapName+".ngchm");   
		    });
		  });  
		}
	
	MMGR.webSaveMapRoperties = webSaveMapProperties;
	function webSaveMapProperties(jsonData) {
		var success = "false";
		var name = CFG.api + "SaveMapProperties?map=" + heatMapName;
		var req = new XMLHttpRequest();
		req.open("POST", name, false);
		req.setRequestHeader("Content-Type", "application/json");
		req.onreadystatechange = function () {
			if (req.readyState == req.DONE) {
				if (req.status != 200) {
					console.log('Failed in call to save propeties from server: ' + req.status);
					success = "false";
				} else {
					success = req.response;
				}
			}
		};	
		req.send(jsonData);
		return success;
	}

	MMGR.zipMapProperties = zipMapProperties;
	function zipMapProperties(jsonData) {
		var success = "";
		var name = CFG.api + "ZippedMap?map=" + heatMapName;
		callServlet("POST", name, jsonData);
		return true;
	}
	
	//  Initialize the data layers once we know the tile structure.
		//  JSON structure object describing available data layers passed in.
		function addDataLayers(mapConfig) {
			//Create heat map data objects for each data level.  All maps should have thumb nail and full level.
			//Each data layer keeps a pointer to the next lower level data layer.
			const levelsConf = mapConfig.data_configuration.map_information.levels;
			const datalayers = mapConfig.data_configuration.map_information.data_layer

			// Create a HeatMapLevel object for level levelId if it's defined in the map configuration.
			// Set the level's lower level to the HeatMapLevel object for lowerLevelId (if it's defined).
			// If levelId is not defined in the map configuration, create an alias to the
			// HeatMapLevel object for altLevelId (if it's defined).
			function createLevel (levelId, lowerLevelId, altLevelId) {
				if (levelsConf.hasOwnProperty (levelId)) {
					datalevels[levelId] = new HeatMapLevel(
									levelId,
									levelsConf[levelId],
									datalayers,
									lowerLevelId ? datalevels[lowerLevelId] : null,
									getTileCacheData,
									getTile);
				} else if (altLevelId) {
					datalevels[levelId] = datalevels[altLevelId];
					// Record all levels for which altLevelId is serving as an immediate alternate.
					if (!alternateLevels.hasOwnProperty(altLevelId)) {
						alternateLevels[altLevelId] = [];
					}
					alternateLevels[altLevelId].push (levelId);				}
			}

			createLevel (MAPREP.THUMBNAIL_LEVEL);
			createLevel (MAPREP.SUMMARY_LEVEL, MAPREP.THUMBNAIL_LEVEL, MAPREP.THUMBNAIL_LEVEL);
			createLevel (MAPREP.DETAIL_LEVEL, MAPREP.SUMMARY_LEVEL, MAPREP.SUMMARY_LEVEL);
			createLevel (MAPREP.RIBBON_VERT_LEVEL, MAPREP.SUMMARY_LEVEL, MAPREP.DETAIL_LEVEL);
			createLevel (MAPREP.RIBBON_HOR_LEVEL, MAPREP.SUMMARY_LEVEL, MAPREP.DETAIL_LEVEL);

			prefetchInitialTiles(datalayers, datalevels, levelsConf);
			sendCallBack(MMGR.Event_INITIALIZED);
	}
	
	function addMapData(md) {
		mapData = md;
		if (COMPAT.mapDataCompatibility(mapData)) {
		    mapUpdatedOnLoad = true;
		}
		sendCallBack(MMGR.Event_JSON);
	}
	
	function addMapConfig(mc) {
		if (COMPAT.CompatibilityManager(mc)) {
		    mapUpdatedOnLoad = true;
		}
		mapConfig = mc;
		sendCallBack(MMGR.Event_JSON);
		addDataLayers(mc);
	}
	
	MMGR.mapUpdatedOnLoad = function() {
		return mapUpdatedOnLoad;
	};

	function prefetchInitialTiles(datalayers, datalevels, levels) {
		const layerNames = Object.keys(datalayers);
		const layers1 = [layerNames[0]];
		const otherLayers = layerNames.slice(1);

		// Prefetch tiles for initial (first) layer.
		if (levels.tn !== undefined) {
			//Kickoff retrieve of thumb nail data tile.
			datalevels[MAPREP.THUMBNAIL_LEVEL].loadTiles(layers1, levels.tn.tile_rows, levels.tn.tile_cols);
		}
		if (levels.d !== undefined) {
			// Initial tile for detail pane only. (Assume top-left tile.)
			datalevels[MAPREP.DETAIL_LEVEL].loadTiles(layers1, 1, 1);
		}
		if (levels.s !== undefined) {
			//Kickoff retrieve of summary data tiles.
			datalevels[MAPREP.SUMMARY_LEVEL].loadTiles(layers1, levels.s.tile_rows, levels.s.tile_cols);
		}

		if (otherLayers.length > 0) {
			setTimeout (function prefetchOtherLayers() {
		// Prefetch tiles for other layers.
		if (levels.tn !== undefined) {
			//Kickoff retrieve of thumb nail data tile.
			datalevels[MAPREP.THUMBNAIL_LEVEL].loadTiles(otherLayers, levels.tn.tile_rows, levels.tn.tile_cols);
		}
		if (levels.s !== undefined) {
			//Kickoff retrieve of summary data tiles.
			datalevels[MAPREP.SUMMARY_LEVEL].loadTiles(otherLayers, levels.s.tile_rows, levels.s.tile_cols);
		}
			}, 0);
		}
	}
	
	// Returns true if map contains detail tiles.  Small maps have only tn and summary
	function hasDetailTiles() {
		const levels = mapConfig.data_configuration.map_information.levels;
		if (levels.d !== undefined) {
			return true;
		} else {
			return false;
		}
	}
	
	// Return the tile cache (For debugging.)
	MMGR.getTileCache = function getTileCache () {
		return tileCache;
	};

	// Display statistics about each loaded tile cache entry.
	MMGR.showTileCacheStats = function () {
		for (let tileCacheName in tileCache) {
			const e = tileCache[tileCacheName];
			if (e.state === 'ready') {
				const loadTime = e.loadTime - e.fetchTime;
				const loadTimePerKByte = loadTime / e.data.length * 1024;
				console.log ({ tileCacheName, KBytes: e.data.length / 1024, loadTime, loadTimePerKByte });
			}
		}
	};

	// Remove a tile cache entry.
	function removeTileCacheEntry (tileCacheName) {
		delete tileCache[tileCacheName];
	}

	// Get the data for a tile, if it's loaded.
	function getTileCacheData (tileCacheName) {
		const entry = tileCache[tileCacheName];
		if (entry && entry.state === 'ready') {
			return entry.data;
		} else {
			return null;
		}
	}

	// Set the data for the specified tile.
	// Also broadcasts a message that the tile has been received.
	function setTileCacheEntry (tileCacheName, arrayData) {
		const entry = tileCache[tileCacheName];
		entry.loadTime = performance.now();
		entry.data = arrayData;

		entry.state = 'ready';
		sendCallBack(MMGR.Event_NEWDATA, Object.assign({},entry.props));
	}
	
	// Handle replies from tileio worker.
	function connectWebLoader () {
		const debug = false;
		jsonSetterFunctions.mapConfig = addMapConfig;
		jsonSetterFunctions.mapData = addMapData;
		MMGR.webLoader.setMessageHandler (function(e) {
			if (debug) console.log({ m: 'Received message from webLoader', e });
			if (e.data.op === 'tileLoaded') {
				const tiledata = new Float32Array(e.data.buffer);
				setTileCacheEntry (e.data.job.tileCacheName, tiledata);
			} else if (e.data.op === 'tileLoadFailed') {
				removeTileCacheEntry (e.data.job.tileCacheName);  // Allow another fetch attempt.
			} else if (e.data.op === 'jsonLoaded') {
				if (!jsonSetterFunctions.hasOwnProperty(e.data.name)) {
					console.log({ m: 'connectWebLoader: unknown JSON request', e });
					return;
				}
				jsonSetterFunctions[e.data.name] (e.data.json);
			} else if (e.data.op === 'jsonLoadFailed') {
				console.error(`Failed to get JSON file ${e.data.name} for ${heatMapName} from server`);
				UHM.mapNotFound(heatMapName);
			} else {
				console.log({ m: 'connectWebLoader: unknown op', e });
			}
		});
	};

	// Create the specified cache entry.
	function createTileCacheEntry (tileCacheName) {
		const [ layer, level, row, col ] = tileCacheName.split('.');
		return tileCache[tileCacheName] = {
			state: 'new',
			data: null,
			props: { layer, level, row: row|0, col: col|0 },
			fetchTime: performance.now(),
			loadTime: 0.0	// Placeholder
		};
	}
	
	// Return true iff the specified tile has completed loading into the tile cache.
	function haveTileData (tileCacheName) {
		const td = tileCache[tileCacheName];
		return td && td.state === 'ready';
	}
	
	//Call the users call back function to let them know the chm is initialized or updated.
	function sendCallBack(event, tile) {

		const heatMap = MMGR.getHeatMap();
		//Initialize event
		if ((event === MMGR.Event_INITIALIZED) || (event === MMGR.Event_JSON) ||
			((event === MMGR.Event_NEWDATA) && (tile.level === MAPREP.THUMBNAIL_LEVEL))) {
			//Only send initialized status if several conditions are met: need all summary JSON and thumb nail.
			if ((mapData != null) &&
				(mapConfig != null) &&
				(Object.keys(datalevels).length > 0) &&
				(haveTileData(heatMap.getCurrentDL()+"."+MAPREP.THUMBNAIL_LEVEL+".1.1")) &&
				 (initialized == 0)) {
					initialized = 1;
					configurePageHeader();
					heatMap.configureFlick();
					if (!mapConfig.hasOwnProperty('panel_configuration')) {
					    UTIL.hideLoader(true);
					}
					sendAllListeners(MMGR.Event_INITIALIZED);
			}
			//Unlikely, but possible to get init finished after all the summary tiles.
			//As a back stop, if we already have the top left summary tile, send a data update event too.
			if (haveTileData(heatMap.getCurrentDL()+"."+MAPREP.SUMMARY_LEVEL+".1.1")) {
				sendAllListeners(MMGR.Event_NEWDATA, { layer: heatMap.getCurrentDL(), level: MAPREP.SUMMARY_LEVEL, row: 1, col: 1});
			}
		} else	if ((event === MMGR.Event_NEWDATA) && (initialized === 1)) {
			sendAllListeners(event, tile);
		}
	}	

	// Configure elements of the page header and top bar that depend on the
	// loaded NGCHM.
	function configurePageHeader() {
		// Show back button if collectionHome specified.
		const backButton = document.getElementById("back_btn");
		const url = UTIL.getURLParameter("collectionHome");
		if (url !== "") {
			backButton.style.display = '';
		}

		const heatMap = MMGR.getHeatMap();
		// Set document title if not a local file.
		if (heatMap.source() !== MMGR.LOCAL_SOURCE) {
			document.title = heatMap.getMapInformation().name;
		}

		// Populate the header's nameDiv.
		const nameDiv = document.getElementById("mapName");  
		let mapName = heatMap.getMapInformation().name;
		if (mapName.length > 30){
			mapName = mapName.substring(0,27) + "...";
		}
		nameDiv.innerHTML = "<b>Map Name:</b>&ensp;"+mapName;
	}

	//send to all event listeners
	function sendAllListeners(event, tile){
		sendAll (event, tile);
		if (event === MMGR.Event_NEWDATA) {
			// Also broadcast NEWDATA events to all layers for which tile.level is an alternate.
			const { layer, level: mylevel, row, col } = tile;
			const alts = getAllAlternateLevels (mylevel);
			while (alts.length > 0) {
				const level = alts.shift();
				sendAll (MMGR.Event_NEWDATA, {layer, level, row, col});
			}
		}

		function sendAll (event, tile) {
			for (var i = 0; i < eventListeners.length; i++) {
				eventListeners[i](event, tile);
			}
		}
	}

	// Recursively determine all levels for which level is an alternate.
	function getAllAlternateLevels (level) {
		const altlevs = alternateLevels.hasOwnProperty (level) ? alternateLevels[level] : [];
		const pal = altlevs.map(lev => getAllAlternateLevels(lev));
		return [...new Set(pal.concat(altlevs).flat())];  // Use [...Set] to ensure uniqueness
	}	
	
	//Fetch a data tile if needed.
	function getTile(layer, level, tileRow, tileColumn) {
		const debug = false;
		var tileCacheName=layer + "." +level + "." + tileRow + "." + tileColumn;
		if (tileCache.hasOwnProperty(tileCacheName)) {
			//Already have tile in cache - do nothing.
			return;
		}
		if (debug) console.log('Creating tileCacheEntry for ' + tileCacheName);
		createTileCacheEntry(tileCacheName);
		var tileName=level + "." + tileRow + "." + tileColumn;  

  	//ToDo: need to limit the number of tiles retrieved.
  	//ToDo: need to remove items from the cache if it is maxed out. - don't get rid of thumb nail or summary.

		if ((fileSrc == MMGR.WEB_SOURCE) || (fileSrc == MMGR.LOCAL_SOURCE)) {
			MMGR.webLoader.postMessage({ op: 'loadTile', job: { tileCacheName, layer, level, tileName} });
		} else {
			//File fileSrc - get tile from zip
			const baseName = heatMapName + "/" + layer + "/"+ level + "/" + tileName;
			var entry = zipFiles[baseName + '.tile'];
			if (typeof entry === 'undefined') {
				entry = zipFiles[baseName + '.bin'];
			}
			if (typeof entry === "undefined") {
				console.error ('Request for unknown tile');
			} else {
				if (debug) console.log('Got zip entry for tile ' + baseName);
				entry.getData(new zip.BlobWriter(), function(blob) {
					if (debug) console.log('Got blob for tile ' + baseName);
					var fr = new FileReader();
					
					fr.onload = function(e) {
				        var arrayBuffer = fr.result;
				        var far32 = new Float32Array(arrayBuffer);
					if (debug) console.log('Got array buffer for tile ' + baseName);
				    	  
				        setTileCacheEntry(tileCacheName, far32);
				     }
	
				     fr.readAsArrayBuffer(blob);		
				}, function(current, total) {
					// onprogress callback
				});		
			}
		}
	}

	//Fetch a JSON file from server.
	//Specify which file to get and what function to call when it arrives.
	//Request is passed to the web loader so that it
	//can be processed concurrently with the main thread.
	function webFetchJson(jsonFile) {
		MMGR.webLoader.postMessage({ op: 'loadJSON', name: jsonFile });
	}
	
	//Helper function to fetch a json file from server.  
	//Specify which file to get and what function to call when it arrives.
	function fileModeFetchVersion() {
		var req = new XMLHttpRequest();
		req.open("GET", COMPAT.versionCheckUrl+COMPAT.version , true);
		req.onreadystatechange = function () {
			if (req.readyState == req.DONE) {
		        if (req.status != 200) {
		        	//Log failure, otherwise, do nothing.
		            console.log('Failed to get software version: ' + req.status);
		        } else {
		        	var latestVersion = req.response;
				// FIXME.
				if ((latestVersion > COMPAT.version) && (typeof NgChm.galaxy === 'undefined') && (MMGR.embeddedMapName === null) && (fileSrc == MMGR.WEB_SOURCE)) {
				    viewerAppVersionExpiredNotification(COMPAT.version, latestVersion);
		        	}
			    } 
			}
		};
		req.send();
	}
	
	//Helper function to fetch a json file from zip file using a zip file entry.  
	function zipFetchJson(entry, setterFunction) {
		entry.getData(new zip.TextWriter(), function(text) {
			// got the json, now call the appropriate setter
			setterFunction(JSON.parse(text));
		}, function(current, total) {
			// onprogress callback
		});
	}
	
};


    //Internal object for traversing the data at a given zoom level.
    class HeatMapLevel {

	constructor (level, jsonData, datalayers, lowerLevel, getTileCacheData, getTile) {
	    this.level = level;
	    this.totalRows = jsonData.total_rows;
	    this.totalColumns = jsonData.total_cols;
	    this.numTileRows = jsonData.tile_rows;
	    this.numTileColumns = jsonData.tile_cols;
	    this.rowsPerTile = jsonData.rows_per_tile;
	    this.colsPerTile = jsonData.cols_per_tile;
	    this.rowSummaryRatio = jsonData.row_summary_ratio;
	    this.colSummaryRatio = jsonData.col_summary_ratio;
	    this.lowerLevel = lowerLevel;
	    this.rowToLower = (lowerLevel === null ? null : this.totalRows/lowerLevel.totalRows);
	    this.colToLower = (lowerLevel === null ? null : this.totalColumns/lowerLevel.totalColumns);
	    this.getTile = getTile;
	    this.getTileCacheData = getTileCacheData;
	}
	
	//Get a value for a row / column.  If the tile with that value is not available, get the down sampled value from
	//the lower data level.
	getLayerValue (layer, row, column) {
	    //Calculate which tile holds the row / column we are looking for.
	    const tileRow = Math.floor((row-1)/this.rowsPerTile) + 1;
	    const tileCol = Math.floor((column-1)/this.colsPerTile) + 1;
	    const arrayData = this.getTileCacheData(layer+"."+this.level+"."+tileRow+"."+tileCol);

	    //If we have the tile, use it.  Otherwise, use a lower resolution tile to provide a value.
	    if (arrayData != undefined) {
		//for end tiles, the # of columns can be less than the this.colsPerTile -
		//figure out the correct num columns.
		const thisTileColsPerRow = tileCol == this.numTileColumns ? ((this.totalColumns % this.colsPerTile) == 0 ? this.colsPerTile : this.totalColumns % this.colsPerTile) : this.colsPerTile; 
		//Tile data is in one long list of numbers.  Calculate which position maps to the row/column we want.
		return arrayData[(row-1)%this.rowsPerTile * thisTileColsPerRow + (column-1)%this.colsPerTile];
	    } else if (this.lowerLevel != null) {
		return this.lowerLevel.getLayerValue(layer, Math.floor((row-1)/this.rowToLower) + 1, Math.floor((column-1)/this.colToLower) + 1);
	    } else {
	    	return 0;
	    }	
	}

	getTileAccessWindow (row, column, numRows, numColumns, getTileWindow) {
	    const startRowTile = Math.floor(row/this.rowsPerTile) + 1;
	    const startColTile = Math.floor(column/this.colsPerTile) + 1;
	    const endRowCalc = (row+(numRows-1))/this.rowsPerTile;
	    const endColCalc = (column+(numColumns-1))/this.colsPerTile;
	    const endRowTile = Math.floor(endRowCalc)+(endRowCalc%1 > 0 ? 1 : 0);
	    const endColTile = Math.floor(endColCalc)+(endColCalc%1 > 0 ? 1 : 0);

	    return getTileWindow (this.level, startRowTile, endRowTile, startColTile, endColTile);
	}

	// External user of the matrix data lets us know where they plan to read.
	// Pull tiles for that area if we don't already have them.
	loadTiles (datalayers, rowTiles, colTiles) {
	    datalayers.forEach(dlayer => {
		for (let i = 1; i <= rowTiles; i++) {
		    for (let j = 1; j <= colTiles; j++) {
			this.getTile(dlayer, this.level, i, j);
		    }
		}
	    });
	}
    }

    /**********************************************************************************
     * FUNCTION - mapHasGaps: The purpose of this function indicate true/false whether
     * a given heat map contains gaps.
     **********************************************************************************/
    MMGR.mapHasGaps = function () {
	    const heatMap = MMGR.getHeatMap();
	    return heatMap.getMapInformation().map_cut_rows+heatMap.getMapInformation().map_cut_cols != 0;
    };

    /* Submodule for caching Actual/Shown labels.
     */
    (function() {
	var actualAxisLabels;
	var shownAxisLabels;
	var shownAxisLabelParams;

	MMGR.initAxisLabels = function () {
	    actualAxisLabels = {};
	    shownAxisLabels = { ROW: [], COLUMN: [] };
	    shownAxisLabelParams = { ROW: {}, COLUMN: {} };
	};
	MMGR.initAxisLabels();

	MMGR.getActualLabels = function (axis) {
		axis = MMGR.isRow(axis) ? "ROW" : "COLUMN";
		if (!actualAxisLabels.hasOwnProperty(axis)) {
			const labels = MMGR.getHeatMap().getAxisLabels(axis)["labels"];
			actualAxisLabels[axis] = labels.map(text => {
				return text === undefined ? undefined : text.split("|")[0];
			});
		}
		return actualAxisLabels[axis];
	};
	MMGR.getShownLabels = function (axis) {
		axis = MMGR.isRow(axis) ? "ROW" : "COLUMN";
		const config = MMGR.getHeatMap().getAxisConfig(axis);
		// Recalculate shown labels if parameters affecting them have changed.
		if (shownAxisLabelParams[axis].label_display_length !== config.label_display_length ||
		    shownAxisLabelParams[axis].label_display_method !== config.label_display_method) {
			shownAxisLabelParams[axis].label_display_length = config.label_display_length;
			shownAxisLabelParams[axis].label_display_method = config.label_display_method;
			const labels = MMGR.getActualLabels(axis);
			shownAxisLabels[axis] = labels.map(text => {
				return text === undefined ? "" : MMGR.getLabelText (text, axis);
			});
		}
		return shownAxisLabels[axis];
	};
    })();

    /**********************************************************************************
     * FUNCTION - getLabelText: The purpose of this function examine label text and
     * shorten the text if the label exceeds the 20 character allowable length.  If the
     * label is in excess, the first 9 and last 8 characters will be written out
     * separated by ellipsis (...);
     **********************************************************************************/
    MMGR.getLabelText = function(text,type,builder) {
	const heatMap = MMGR.getHeatMap();
	    var size = parseInt(heatMap.getColConfig().label_display_length);
	    var elPos = heatMap.getColConfig().label_display_method;
	    if (type.toUpperCase() === "ROW") {
		    size = parseInt(heatMap.getRowConfig().label_display_length);
		    elPos = heatMap.getRowConfig().label_display_method;
	    }
	    //Done for displaying labels on Summary side in builder
	    if (typeof builder !== 'undefined') {	/* FIXME: BMB */
		    size = 16;
	    }
	    if (text.length > size) {
		    if (elPos === 'END') {
			    text = text.substr(0,size - 3)+"...";
		    } else if (elPos === 'MIDDLE') {
			    text = text.substr(0,(size/2 - 1))+"..."+text.substr(text.length-(size/2 - 2),text.length);
		    } else {
			    text = "..."+text.substr(text.length - (size - 3), text.length);
		    }
	    }
	    return text;
    };

    /**********************************************************************************
     * FUNCTION - zipAppDownload: The user clicked on the "Download Viewer" button.
     * Hide the button and initiate download of the NG-CHM Viewer application.
     **********************************************************************************/
    MMGR.zipAppDownload = zipAppDownload;
    function zipAppDownload () {
	downloadFileApplication();
    }

    // Initiate download of NGCHM File Viewer application zip
    function downloadFileApplication () {
	if (typeof NgChm.galaxy !== 'undefined') {
	    // Current viewer is embedded within Galaxy.
	    // FIXME: BMB: Use a better way to determine Galaxy embedding.
	    window.open("/plugins/visualizations/mda_heatmap_viz/static/ngChmApp.zip");
	} else if (MMGR.getHeatMap().source() === MMGR.FILE_SOURCE) {
	    // Heat map came from a disk file, not from a server.
	    // (This does not mean the viewer is not from a server, so this could be
	    // refined further for that case i.e. the "api" condition might be more appropriate)
	    // Use full URL, which must be complete!
	    callServlet("GET", COMPAT.viewerAppUrl, false);
	} else {
	    // Heat map came from a server.
	    // Use server "api" + special endpoint name
	    callServlet("GET", CFG.api + "ZipAppDownload", false);
	}
    }

    /**********************************************************************************
     * FUNCTION - viewerAppVersionExpiredNotification: This function handles all of the tasks
     * necessary display a modal window whenever a user's version of the file application
     * has been superceded and a new version of the file application should be downloaded.
     **********************************************************************************/
    function viewerAppVersionExpiredNotification (oldVersion, newVersion) {
	    UHM.initMessageBox();
	    UHM.setMessageBoxHeader("New NG-CHM File Viewer Version Available");
	    UHM.setMessageBoxText("<br>The version of the NG-CHM File Viewer application that you are running ("+oldVersion+") has been superceded by a newer version ("+newVersion+"). You will be able to view all pre-existing heat maps with this new backward-compatible version. However, you may wish to download the latest version of the viewer.<br><br>The application downloads as a single HTML file (ngchmApp.html).  When the download completes, you may run the application by simply double-clicking on the downloaded file.  You may want to save this file to a location of your choice on your computer for future use.<br><br>");
	    UHM.setMessageBoxButton(1, "images/downloadViewer.png", "Download NG-CHM Viewer App", zipAppDownload);
	    UHM.setMessageBoxButton(3, UTIL.imageTable.closeButton, "Cancel button", UHM.messageBoxCancel);
	    UHM.displayMessageBox();
    }

/**********************************************************************************
 * Perform Early Initializations.
 *
 * Perform latency sensitive initializations.  Note that the complete sources
 * have not loaded yet.
 **********************************************************************************/

if (MMGR.embeddedMapName === null && (UTIL.mapId !== '' || UTIL.mapNameRef !== '')) {
	MMGR.createWebLoader(MMGR.WEB_SOURCE);
}

// Special tooltip with content populated from the loaded heat map.
document.getElementById('mapName').addEventListener('mouseover', (ev) => {
    const heatMap = MMGR.getHeatMap();
    UHM.hlp(ev.target,"Map Name: " + (heatMap !== null ? heatMap.getMapInformation().name : "Not yet available") + "<br><br>Description: " + (heatMap !== null ? heatMap.getMapInformation().description : "N/A"),350);
}, { passive: true });

})();
