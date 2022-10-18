(function() {
    "use strict";
    NgChm.markFile();

    //Define Namespace for NgChm Events
    const DEV = NgChm.createNS('NgChm.DEV');

    const MAPREP = NgChm.importNS('NgChm.MAPREP');
    const MMGR = NgChm.importNS('NgChm.MMGR');
    const DVW = NgChm.importNS('NgChm.DVW');
    const DET = NgChm.importNS('NgChm.DET');
    const UTIL = NgChm.importNS('NgChm.UTIL');
    const UHM = NgChm.importNS('NgChm.UHM');
    const DDR = NgChm.importNS('NgChm.DDR');
    const SRCH = NgChm.importNS('NgChm.SRCH');
    const SUM = NgChm.importNS('NgChm.SUM');
    const LNK = NgChm.importNS('NgChm.LNK');
    const DRAW = NgChm.importNS('NgChm.DRAW');
    var mouseEventActive = false;
    var mouseDown = false;

    DEV.targetCanvas = null;
    var scrollTime = null;    // timer for scroll events to prevent multiple events firing after scroll ends

    DEV.clearScrollTime = function() {
	scrollTime = null;
    };

    DEV.setMouseDown = function (isDown) {
	mouseDown = isDown;
    };

/**********************************************************************************
 * FUNCTION - addEvents: These function adds event listeners to canvases on a
 * given heat map panel.  
 **********************************************************************************/
DEV.addEvents = function (paneId) {
	const mapItem = DVW.getMapItemFromPane(paneId);
	mapItem.canvas.oncontextmenu = DEV.matrixRightClick;
	mapItem.canvas.onmouseup = DEV.clickEnd;
	mapItem.canvas.onmousemove = DEV.handleMouseMove;
	mapItem.canvas.onmouseout = DEV.handleMouseOut;
	
	mapItem.canvas.onmousedown = DEV.clickStart;
	mapItem.canvas.ondblclick = DEV.dblClick;
	
	mapItem.canvas.addEventListener('wheel', DEV.handleScroll, UTIL.passiveCompat({capture: false, passive: false}));

	
	mapItem.canvas.addEventListener("touchstart", function(e){
		UHM.hlpC();
		const now = new Date().getTime();
		const timesince = now - mapItem.latestTap;
		if((timesince < 600) && (timesince > 0) && e.touches.length == 1){ // double tap
		}else if (e.touches.length == 2){ // two finger tap
		} else if (e.touches.length == 1) { // single finger tap
			mapItem.latestTapLocation = UTIL.getCursorPosition(e);
			DET.clickStart(e);
		}
		mapItem.latestTap = now;
	}, UTIL.passiveCompat({ passive: false }));
	
	mapItem.canvas.addEventListener("touchmove", function(e){
		if (e.touches){
	    	if (e.touches.length > 2){
			clearTimeout(DET.eventTimer);
	    		return false;
	    	} else if (e.touches.length == 2){
			clearTimeout(DET.eventTimer);
	    		e.preventDefault();
	    		mapItem.latestTap = null;
	    		const distance = Math.hypot(
	    			    e.touches[0].pageX - e.touches[1].pageX,
	    			    e.touches[0].pageY - e.touches[1].pageY);
	    		const distanceX = Math.abs(e.touches[0].clientX - e.touches[1].clientX);
	    		const distanceY = Math.abs(e.touches[0].clientY - e.touches[1].clientY);
	    		if (!mapItem.latestPinchDistance){
	    			mapItem.latestPinchDistance = distance;
	    		} else if (distance > mapItem.latestPinchDistance){ // pinch inward
				DEV.detailDataZoomIn(mapItem);
	    		} else if (mapItem.latestPinchDistance > distance){ // pinch outward
				DEV.detailDataZoomOut(e);
	    		}
	    		mapItem.latestPinchDistance = distance;
	    	} else if (e.touches.length == 1){
			clearTimeout(DET.eventTimer);
			mouseDown = true;
			DET.handleMoveDrag(e);
	    	}
	    }
	}, UTIL.passiveCompat({ capture: false, passive: false }));
	
	mapItem.canvas.addEventListener("touchend", function(e){
		if (e.touches.length == 0){
			mouseDown = false;
			mapItem.latestPinchDistance = null;
			const now = new Date().getTime();
			if (mapItem.latestTap){
				const timesince = now - mapItem.latestTap;
				const coords = UTIL.getCursorPosition(e);
				const diffX = Math.abs(coords.x - mapItem.latestTapLocation.x); 
				const diffY = Math.abs(coords.y - mapItem.latestTapLocation.y);
				const diffMax = Math.max(diffX,diffY);
				if (timesince > 500 && diffMax < 20){
					clearTimeout(DET.eventTimer);
					UHM.hlpC();
					DEV.matrixRightClick(e);
				} else if (timesince < 500 && diffMax < 20){
					DEV.userHelpOpen();
				}
			}
	    }
	}, UTIL.passiveCompat({ capture: false, passive: false }));
		
	// set up touch events for row and column labels
	const rowLabelDiv = document.getElementById(mapItem.rowLabelDiv);
	const colLabelDiv = document.getElementById(mapItem.colLabelDiv);
	
	rowLabelDiv.addEventListener("touchstart", function(e){
		UHM.hlpC();
		const now = new Date().getTime();
		mapItem.latestLabelTap = now;
	}, UTIL.passiveCompat({ passive: true }));
		
	rowLabelDiv.addEventListener("touchend", function(e){
		if (e.touches.length == 0){
			const now = new Date().getTime();
			const timesince = now - mapItem.latestLabelTap;
			if (timesince > 500){
				DEV.labelRightClick(e);
			}
		}
	}, UTIL.passiveCompat({ passive: false }));
	
	colLabelDiv.addEventListener("touchstart", function(e){
		UHM.hlpC();
		const now = new Date().getTime();
		mapItem.latestLabelTap = now;
	}, UTIL.passiveCompat({ passive: true }));
	
	colLabelDiv.addEventListener("touchend", function(e){
		if (e.touches.length == 0){
			const now = new Date().getTime();
			const timesince = now - mapItem.latestLabelTap;
			if (timesince > 500){
				DEV.labelRightClick(e);
			}
		}
	}, UTIL.passiveCompat({ passive: false }));
	
}

/**********************************************************************************
 * FUNCTION - userHelpOpen: This function handles all of the tasks necessary to
 * generate help pop-up panels for the detail heat map and the detail heat map
 * classification bars.
 *********************************************************************************/
DEV.userHelpOpen = function(mapItem) {
    const heatMap = MMGR.getHeatMap();
    UHM.hlpC();
    var helpContents = document.createElement("TABLE");
    helpContents.id = 'helpTable';
    var orgW = window.innerWidth+window.pageXOffset;
    var orgH = window.innerHeight+window.pageYOffset;
    var helptext = UHM.getDivElement("helptext");
    helptext.innerHTML=("<a align='left'>Copy To Clipboard</a><img id='redX_btn' src='images/redX.png' alt='Close Help' align='right'>");
    helptext.children[0].onclick = UHM.pasteHelpContents;  // The <A> element.
    helptext.onclick = function(event) { UHM.hlpC(); };
    helptext.style.position = "absolute";
    document.getElementsByTagName('body')[0].appendChild(helptext);
    var rowElementSize = mapItem.dataBoxWidth * mapItem.canvas.clientWidth/mapItem.canvas.width; // px/Glpoint
    var colElementSize = mapItem.dataBoxHeight * mapItem.canvas.clientHeight/mapItem.canvas.height;

    // pixels
    var rowClassWidthPx = DET.getRowClassPixelWidth(mapItem);
    var colClassHeightPx = DET.getColClassPixelHeight(mapItem);
    var mapLocY = mapItem.offsetY - colClassHeightPx;
    var mapLocX = mapItem.offsetX - rowClassWidthPx;
    var objectType = "none";
    if (mapItem.offsetY > colClassHeightPx) {
	if  (mapItem.offsetX > rowClassWidthPx) {
		objectType = "map";
	}
	if  (mapItem.offsetX < rowClassWidthPx) {
		objectType = "rowClass";
	}
    } else {
	if  (mapItem.offsetX > rowClassWidthPx) {
		objectType = "colClass";
	}
    }
    if (objectType === "map") {
	var row = Math.floor(mapItem.currentRow + (mapLocY/colElementSize)*getSamplingRatio('row'));
	var col = Math.floor(mapItem.currentCol + (mapLocX/rowElementSize)*getSamplingRatio('col'));
	if ((row <= heatMap.getNumRows('d')) && (col <= heatMap.getNumColumns('d'))) {
		// Gather the information about the current pixel.
		let matrixValue = heatMap.getValue(MAPREP.DETAIL_LEVEL,row,col);
		if (matrixValue >= MAPREP.maxValues) {
		    matrixValue = "Missing Value";
		} else if (matrixValue <= MAPREP.minValues) {
		    return; // A gap.
		} else {
		    matrixValue = matrixValue.toFixed(5);
		}
		if (DVW.primaryMap.mode === 'FULL_MAP') {
		    matrixValue = matrixValue + "<br>(summarized)";
		}

		const rowLabels = heatMap.getRowLabels().labels;
		const colLabels = heatMap.getColLabels().labels;
		const pixelInfo = {
		    value: matrixValue,
		    rowLabel: rowLabels[row-1],
		    colLabel: colLabels[col-1]
		};
		const rowClassBars = heatMap.getRowClassificationData();
		const rowClassConfig = heatMap.getRowClassificationConfig();
		pixelInfo.rowCovariates = heatMap
			.getRowClassificationOrder()
			.filter(key => rowClassConfig[key].show === 'Y')
			.map(key => ({
				name: key,
				value: rowClassBars[key].values[row-1]
			}));
		const colClassBars = heatMap.getColClassificationData();
		const colClassConfig = heatMap.getColClassificationConfig();
		pixelInfo.colCovariates = heatMap
			.getColClassificationOrder()
			.filter(key => colClassConfig[key].show === 'Y')
			.map(key => ({
				name: key,
				value: colClassBars[key].values[col-1]
			}));

		// If the enclosing window wants to display the pixel info, send it to them.
		// Otherwise, display it ourselves.
		if (UHM.postMapDetails) {
			var msg = { nonce: UHM.myNonce, msg: 'ShowMapDetail', data: pixelInfo };
			//If a unique identifier was provided, return it in the message.
			if (UHM.postID != null) {
			    msg["id"] = UHM.postID;
			}

			window.parent.postMessage (msg, UHM.postMapToWhom);
		} else {
			UHM.formatMapDetails (helpContents, pixelInfo);
			helptext.style.display="inline";
			helptext.appendChild(helpContents);
			locateHelpBox(helptext,mapItem);
		}
	}
    } else if ((objectType === "rowClass") || (objectType === "colClass")) {
	var pos, value, label;
	var hoveredBar, hoveredBarColorScheme, hoveredBarValues;
	if (objectType === "colClass") {
		var col = Math.floor(mapItem.currentCol + (mapLocX/rowElementSize)*getSamplingRatio('col'));
		var colLabels = heatMap.getColLabels().labels;
		label = colLabels[col-1];
		var coveredHeight = 0;
		pos = Math.floor(mapItem.currentCol + (mapLocX/rowElementSize));
		var classBarsConfig = heatMap.getColClassificationConfig();
		var classBarsConfigOrder = heatMap.getColClassificationOrder();
			for (var i = 0; i <  classBarsConfigOrder.length; i++) {
				var key = classBarsConfigOrder[i];
			var currentBar = classBarsConfig[key];
			if (currentBar.show === 'Y') {
				coveredHeight += mapItem.canvas.clientHeight*currentBar.height/mapItem.canvas.height;
				if (coveredHeight >= mapItem.offsetY) {
					hoveredBar = key;
					hoveredBarValues = heatMap.getColClassificationData()[key].values;
					break;
				}
			}
		}
		var colorMap = heatMap.getColorMapManager().getColorMap("col",hoveredBar);
	} else {
		var row = Math.floor(mapItem.currentRow + (mapLocY/colElementSize)*getSamplingRatio('row'));
		var rowLabels = heatMap.getRowLabels().labels;
		label = rowLabels[row-1];
		var coveredWidth = 0;
		pos = Math.floor(mapItem.currentRow + (mapLocY/colElementSize));
		var classBarsConfig = heatMap.getRowClassificationConfig();
		var classBarsConfigOrder = heatMap.getRowClassificationOrder();
			for (var i = 0; i <  classBarsConfigOrder.length; i++) {
				var key = classBarsConfigOrder[i];
				var currentBar = classBarsConfig[key];
			if (currentBar.show === 'Y') {
				coveredWidth += mapItem.canvas.clientWidth*currentBar.height/mapItem.canvas.width;
				if (coveredWidth >= mapItem.offsetX){
					hoveredBar = key;
					hoveredBarValues = heatMap.getRowClassificationData()[key].values;
					break;
				}
			}
		}
		var colorMap = heatMap.getColorMapManager().getColorMap("row",hoveredBar);
	}
	var value = hoveredBarValues[pos-1];
	//No help popup when clicking on a gap in the class bar
	if (value === '!CUT!') {
		return;
	}
	var colors = colorMap.getColors();
	var classType = colorMap.getType();
	if ((value === 'null') || (value === 'NA')) {
		value = "Missing Value";
	}
	var thresholds = colorMap.getThresholds();
	var thresholdSize = 0;
	// For Continuous Classifications:
	// 1. Retrieve continuous threshold array from colorMapManager
	// 2. Retrieve threshold range size divided by 2 (1/2 range size)
	// 3. If remainder of half range > .75 set threshold value up to next value, Else use floor value.
	if (classType == 'continuous') {
		thresholds = colorMap.getContinuousThresholdKeys();
		var threshSize = colorMap.getContinuousThresholdKeySize()/2;
		if ((threshSize%1) > .5) {
			// Used to calculate modified threshold size for all but first and last threshold
			// This modified value will be used for color and display later.
			thresholdSize = Math.floor(threshSize)+1;
		} else {
			thresholdSize = Math.floor(threshSize);
		}
	}

	// Build TABLE HTML for contents of help box
		var displayName = hoveredBar;
		if (hoveredBar.length > 20){
			displayName = displayName.substring(0,20) + "...";
		}
		UHM.setTableRow(helpContents, ["Label: ", "&nbsp;"+label]);
		UHM.setTableRow(helpContents, ["Covariate: ", "&nbsp;"+displayName]);
		UHM.setTableRow(helpContents, ["Value: ", "&nbsp;"+value]);
		helpContents.insertRow().innerHTML = UHM.formatBlankRow();
	var rowCtr = 3 + thresholds.length;
	var prevThresh = currThresh;
	for (var i = 0; i < thresholds.length; i++){ // generate the color scheme diagram
		var color = colors[i];
		var valSelected = 0;
		var valTotal = hoveredBarValues.length;
		var currThresh = thresholds[i];
		var modThresh = currThresh;
		if (classType == 'continuous') {
			// IF threshold not first or last, the modified threshold is set to the threshold value
			// less 1/2 of the threshold range ELSE the modified threshold is set to the threshold value.
			if ((i != 0) &&  (i != thresholds.length - 1)) {
				modThresh = currThresh - thresholdSize;
			}
				color = colorMap.getRgbToHex(colorMap.getClassificationColor(modThresh));
		}

		//Count classification value occurrences within each breakpoint.
		for (var j = 0; j < valTotal; j++) {
			let classBarVal = hoveredBarValues[j];
			if (classType == 'continuous') {
			// Count based upon location in threshold array
			// 1. For first threshhold, count those values <= threshold.
			// 2. For second threshold, count those values >= threshold.
			// 3. For penultimate threshhold, count those values > previous threshold AND values < final threshold.
			// 3. For all others, count those values > previous threshold AND values <= final threshold.
				if (i == 0) {
						if (classBarVal <= currThresh) {
						valSelected++;
						}
				} else if (i == thresholds.length - 1) {
					if (classBarVal >= currThresh) {
						valSelected++;
					}
				} else if (i == thresholds.length - 2) {
					if ((classBarVal > prevThresh) && (classBarVal < currThresh)) {
						valSelected++;
					}
				} else {
					if ((classBarVal > prevThresh) && (classBarVal <= currThresh)) {
						valSelected++;
					}
				}
			} else {
			var value = thresholds[i];
				if (classBarVal == value) {
					valSelected++;
				}
			}
		}
		var selPct = Math.round(((valSelected / valTotal) * 100) * 100) / 100;  //new line
		if (currentBar.bar_type === 'color_plot') {
		    UHM.setTableRow(helpContents, ["<div class='input-color'><div class='color-box' style='background-color: " + color + ";'></div></div>", modThresh + " (n = " + valSelected + ", " + selPct+ "%)"]);
		} else {
		    UHM.setTableRow(helpContents, ["<div> </div></div>", modThresh + " (n = " + valSelected + ", " + selPct+ "%)"]);
		}
		prevThresh = currThresh;
	}
	var valSelected = 0;
	var valTotal = hoveredBarValues.length;
	for (var j = 0; j < valTotal; j++) {
		if ((hoveredBarValues[j] == "null") || (hoveredBarValues[j] == "NA")) {
			valSelected++;
		}
	}
	var selPct = Math.round(((valSelected / valTotal) * 100) * 100) / 100;  //new line
	if (currentBar.bar_type === 'color_plot') {
			UHM.setTableRow(helpContents, ["<div class='input-color'><div class='color-box' style='background-color: " +  colorMap.getMissingColor() + ";'></div></div>", "Missing Color (n = " + valSelected + ", " + selPct+ "%)"]);
	} else {
			UHM.setTableRow(helpContents, ["<div> </div></div>", "Missing Color (n = " + valSelected + ", " + selPct+ "%)"]);
	}

		// If the enclosing window wants to display the covarate info, send it to them.
		// Otherwise, display it ourselves.
	if (UHM.postMapDetails) {
			var msg = { nonce: UHM.myNonce, msg: 'ShowCovarDetail', data: helpContents.innerHTML };
			//If a unique identifier was provided, return it in the message.
			if (UHM.postID != null) {
				msg["id"] = UHM.postID;
			}

			window.parent.postMessage (msg, UHM.postMapToWhom);
	} else {
		helptext.style.display="inline";
		helptext.appendChild(helpContents);
		locateHelpBox(helptext,mapItem);
	}
    } else {
	// on the blank area in the top left corner
    }
    SUM.redrawCanvases();
};


/*********************************************************************************************
 * FUNCTION:  handleScroll - The purpose of this function is to handle mouse scroll wheel 
 * events to zoom in / out.
 *********************************************************************************************/
DEV.handleScroll = function(evt) {
	evt.preventDefault();
	let parentElement = evt.target.parentElement;
	if (!parentElement.classList.contains('detail_chm')) {
	        if (!DVW.primaryMap) return;
		parentElement = DVW.primaryMap.chm;
	}
	if (scrollTime == null || evt.timeStamp - scrollTime > 150){
		scrollTime = evt.timeStamp;
		if (evt.wheelDelta < -30 || evt.deltaY > 0 || evt.scale < 1) { //Zoom out
            DEV.detailDataZoomOut(parentElement);
		} else if ((evt.wheelDelta > 30 || evt.deltaY < 0 || evt.scale > 1)){ // Zoom in
            DEV.zoomAnimation(parentElement);
		}	
	}
	return false;
} 		

/*********************************************************************************************
 * FUNCTION:  clickStart - The purpose of this function is to handle a user mouse down event.  
 *********************************************************************************************/
DEV.clickStart = function (e) {
	e.preventDefault();
	const mapItem = DVW.getMapItemFromCanvas(e.currentTarget);
	mouseEventActive = true;
	const clickType = UTIL.getClickType(e);
	UHM.hlpC();
	if (clickType === 0) { 
		const coords = UTIL.getCursorPosition(e);
		mapItem.dragOffsetX = coords.x;  //canvas X coordinate 
		mapItem.dragOffsetY = coords.y;
		mouseDown = true;
		// client space
		const divW = e.target.clientWidth;
		const divH = e.target.clientHeight;
		// texture space
		const rowTotalW = mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row");
		const colTotalH = mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column");
		// proportion space
		const rowDendroW = mapItem.dendroWidth/rowTotalW;
		const colDendroH = mapItem.dendroHeight/colTotalH;
		const rowClassW = DET.calculateTotalClassBarHeight("row")/rowTotalW;
		const colClassH = DET.calculateTotalClassBarHeight("column")/colTotalH;
		const mapW = mapItem.dataViewWidth/rowTotalW;
		const mapH = mapItem.dataViewHeight/colTotalH;
		const clickX = coords.x/divW;
		const clickY = coords.y/divH;
		mapItem.offsetX = coords.x;
		mapItem.offsetY = coords.y;
		mapItem.pageX = e.targetTouches ? e.targetTouches[0].pageX : e.pageX;
		mapItem.pageY = e.targetTouches ? e.targetTouches[0].pageY : e.pageY;
		if (DET.eventTimer != 0) {
			clearTimeout(DET.eventTimer);
		}
		DET.eventTimer = setTimeout(DEV.userHelpOpen.bind('mapItem', mapItem), 500);
	}
}

/*********************************************************************************************
 * FUNCTION:  clickEnd - The purpose of this function is to handle a user mouse up event.  
 * If the mouse has not moved out of a given detail row/col between clickStart and clickEnd, 
 * user help is opened for that cell.
 *********************************************************************************************/
DEV.clickEnd = function (e) {
	const mapItem = DVW.getMapItemFromCanvas(e.currentTarget);
	if (mouseEventActive) {
		const clickType = UTIL.getClickType(e);
		if (clickType === 0) {
			//Reset mouse event indicators
			mouseDown = false;
			//Set cursor back to default
			mapItem.canvas.style.cursor="default";
		}
	}
	mouseEventActive = false;
}

/*********************************************************************************************
 * FUNCTION:  dblClick -  The purpose of this function is to handle the situation where the 
 * user double-clicks on the detail heat map canvas.  In this case a zoom action is performed.  
 * Zoom in if the shift key is not held down and zoom out if the key is held down.
 *********************************************************************************************/
DEV.dblClick = function(e) {
	const mapItem = DVW.getMapItemFromCanvas(e.currentTarget);
	//turn off single click help if double click
	clearTimeout(DET.eventTimer);
	UHM.hlpC();
	//Get cursor position and convert to matrix row / column
	const rowElementSize = mapItem.dataBoxWidth * mapItem.canvas.clientWidth/mapItem.canvas.width; 
	const colElementSize = mapItem.dataBoxHeight * mapItem.canvas.clientHeight/mapItem.canvas.height;
	const coords = UTIL.getCursorPosition(e);
	const mapLocY = coords.y - DET.getColClassPixelHeight(mapItem);
	const mapLocX = coords.x - DET.getRowClassPixelWidth(mapItem);

	const clickRow = Math.floor(mapItem.currentRow + (mapLocY/colElementSize)*getSamplingRatio('row'));
	const clickCol = Math.floor(mapItem.currentCol + (mapLocX/rowElementSize)*getSamplingRatio('col'));
	const destRow = clickRow + 1 - Math.floor(DVW.getCurrentDetDataPerCol(mapItem)/2);
	const destCol = clickCol + 1 - Math.floor(DVW.getCurrentDetDataPerRow(mapItem)/2);
	
	// set up panning animation 
	const diffRow =  clickRow + 1 - Math.floor(DVW.getCurrentDetDataPerCol(mapItem)/2) - mapItem.currentRow;
	const diffCol =  clickCol + 1 - Math.floor(DVW.getCurrentDetDataPerRow(mapItem)/2) - mapItem.currentCol;
	const diffMax = Math.max(diffRow,diffCol);
	const numSteps = 7;
	const rowStep = diffRow/numSteps;
	const colStep = diffCol/numSteps;
	let steps = 1;
	//Special case - if in full map view, skip panning and jump to zoom
	if (mapItem.mode == 'FULL_MAP') 
		steps = numSteps;
		
	drawScene();
	function drawScene(now){
		steps++;
		if (steps < numSteps && !(mapItem.currentRow == destRow && mapItem.currentCol == destCol)){ // if we have not finished the animation, continue redrawing
			mapItem.currentRow = clickRow + 1 - Math.floor(DVW.getCurrentDetDataPerCol(mapItem)/2 + (numSteps-steps)*rowStep);
			mapItem.currentCol = clickCol + 1 - Math.floor(DVW.getCurrentDetDataPerCol(mapItem)/2 + (numSteps-steps)*colStep);
			DVW.checkRow(mapItem);
			DVW.checkCol(mapItem);
			mapItem.updateSelection();
			requestAnimationFrame(drawScene); // requestAnimationFrame is a native JS function that calls drawScene after a short time delay
		} else { // if we are done animating, zoom in
			mapItem.currentRow = destRow;
			mapItem.currentCol = destCol;
			
			if (e.shiftKey) {
				DEV.detailDataZoomOut(e);
			} else {
				DEV.zoomAnimation(mapItem.chm, clickRow, clickCol);
			}
			//Center the map on the cursor position
			DVW.checkRow(mapItem);
			DVW.checkCol(mapItem);
			mapItem.updateSelection();
		}
	}
}

/*********************************************************************************************
 * FUNCTION:  labelClick -  The purpose of this function is to handle a label click on a given
 * detail panel.
 *********************************************************************************************/
DEV.labelClick = function (e) {
	const mapItem = DVW.getMapItemFromChm(e.target.parentElement.parentElement);
	SRCH.showSearchResults();
	//These were changed from vars defined multiple times below
	let searchIndex = null;
	let axis = this.dataset.axis;
	const index = this.dataset.index;
	if (e.shiftKey || e.type == "touchmove"){ // shift + click
		const selection = window.getSelection();
		selection.removeAllRanges();
		const focusNode = e.type == "touchmove" ? e.target : this;
		const focusIndex = Number(focusNode.dataset.index);
		axis = focusNode.dataset.axis;
		if (DET.labelLastClicked[axis]){ // if label in the same axis was clicked last, highlight all
			const anchorIndex = Number(DET.labelLastClicked[axis]);
			const startIndex = Math.min(focusIndex,anchorIndex), endIndex = Math.max(focusIndex,anchorIndex);
			SRCH.setAxisSearchResults (axis, startIndex, endIndex);
		} else { // otherwise, treat as normal click
			SRCH.clearSearchItems(focusNode.dataset.axis);
			searchIndex = SRCH.labelIndexInSearch(axis,focusIndex);
			if (searchIndex ){
				SRCH.clearAxisSearchItems (axis, index, index);
			} else {
				SRCH.setAxisSearchResults (axis, focusIndex, focusIndex);
			}
		}
		DET.labelLastClicked[axis] = focusIndex;
	} else if (e.ctrlKey || e.metaKey){ // ctrl or Mac key + click
		searchIndex = SRCH.labelIndexInSearch(axis, index);
		if (searchIndex){ // if already searched, remove from search items
			SRCH.clearAxisSearchItems (axis, index, index);
		} else {
			SRCH.setAxisSearchResults (axis, index, index);
		}
		DET.labelLastClicked[axis] = index;
	} else { // standard click
		SRCH.clearSearchItems(axis);
		SRCH.setAxisSearchResults (axis, index, index);
		DET.labelLastClicked[axis] = index;
	}
	const clickType = (e.ctrlKey || e.metaKey) ? 'ctrlClick' : 'standardClick';
	const lastClickedIndex = (typeof index == 'undefined') ? focusIndex : index;
	LNK.postSelectionToLinkouts(this.dataset.axis, clickType, index, null);
	const searchElement = document.getElementById('search_text');
	searchElement.value = "";
	document.getElementById('prev_btn').style.display='';
	document.getElementById('next_btn').style.display='';
	document.getElementById('cancel_btn').style.display='';
	SUM.clearSelectionMarks();
	DET.updateDisplayedLabels();
	DVW.updateSelections();
	SUM.drawSelectionMarks();
	SUM.drawTopItems();
	SRCH.showSearchResults();
}

/*********************************************************************************************
 * FUNCTION:  labelDrag -  The purpose of this function is to handle a label drag on a given
 * detail panel.
 *********************************************************************************************/
DEV.labelDrag = function(e){
	const mapItem = DVW.getMapItemFromChm(e.target.parentElement.parentElement);
	e.preventDefault();
	mapItem.latestLabelTap = null;
	const selection = window.getSelection();
	selection.removeAllRanges();
	const focusNode = e.type == "touchmove" ? document.elementFromPoint(e.touches[0].pageX, e.touches[0].pageY) : this;
	const focusIndex = Number(focusNode.dataset.index);
	const axis = focusNode.dataset.axis;
	if (DET.labelLastClicked[axis]){ // if label in the same axis was clicked last, highlight all
		const anchorIndex = Number(DET.labelLastClicked[axis]);
		const startIndex = Math.min(focusIndex,anchorIndex), endIndex = Math.max(focusIndex,anchorIndex);
		SRCH.setAxisSearchResults (axis, startIndex, endIndex);
	} else { // otherwise, treat as normal click
		SRCH.clearSearchItems(focusNode.dataset.axis);
		const searchIndex = SRCH.labelIndexInSearch(axis,focusIndex);
		if (searchIndex ){
			SRCH.clearAxisSearchItems (axis, index, index);
		} else {
			SRCH.setAxisSearchResults (axis, focusIndex, focusIndex);
		}
	}
	DET.labelLastClicked[axis] = focusIndex;
	let searchElement = document.getElementById('search_text');
	searchElement.value = "";
	document.getElementById('prev_btn').style.display='';
	document.getElementById('next_btn').style.display='';
	document.getElementById('cancel_btn').style.display='';
	DET.updateDisplayedLabels();
	SRCH.showSearchResults();
	DVW.updateSelections();
	SUM.drawSelectionMarks();
	SUM.drawTopItems();
	SRCH.showSearchResults();
	return;
}

/*********************************************************************************************
 * FUNCTION:  labelRightClick -  The purpose of this function is to handle a label right click on a given
 * detail panel.
 *********************************************************************************************/
DEV.labelRightClick = function (e) {
    e.preventDefault();
    const axis = e.target.dataset.axis;
    LNK.labelHelpClose(axis);
    LNK.labelHelpOpen(axis,e);
    let selection = window.getSelection();
    selection.removeAllRanges();
    return false;
}

/*********************************************************************************************
 * FUNCTION:  matrixRightClick -  The purpose of this function is to handle a matrix right 
 * click on a given detail panel.
 *********************************************************************************************/
DEV.matrixRightClick = function (e) {
	e.preventDefault();
	LNK.labelHelpClose("Matrix");
    LNK.labelHelpOpen("Matrix",e);
    let selection = window.getSelection();
    selection.removeAllRanges();
    return false;
};

/*********************************************************************************************
 * FUNCTION:  handleMouseOut - The purpose of this function is to handle the situation where 
 * the user clicks on and drags off the detail canvas without letting up the mouse button.  
 * In these cases, we cancel the mouse event that we are tracking, reset mouseDown, and 
 * reset the cursor to default.
 *********************************************************************************************/
DEV.handleMouseOut = function (e) {
	const mapItem = DVW.getMapItemFromCanvas(e.currentTarget);
	mapItem.canvas.style.cursor="default";
	mouseDown = false;
	mouseEventActive = false;
}

    /*********************************************************************************************
     * FUNCTION:  isOnObject - The purpose of this function is to tell us if the cursor is over
     * a given screen object.
     *********************************************************************************************/
    function isOnObject (e,type) {
	const mapItem = DVW.getMapItemFromCanvas(e.currentTarget);
	var rowClassWidthPx =  DET.getRowClassPixelWidth(mapItem);
	var colClassHeightPx = DET.getColClassPixelHeight(mapItem);
	var rowDendroWidthPx =  DET.getRowDendroPixelWidth(mapItem);
	var colDendroHeightPx = DET.getColDendroPixelHeight(mapItem);
	var coords = UTIL.getCursorPosition(e);
	if (coords.y > colClassHeightPx) {
	    if  ((type == "map") && coords.x > rowClassWidthPx) {
		return true;
	    }
	    if  ((type == "rowClass") && coords.x < rowClassWidthPx + rowDendroWidthPx && coords.x > rowDendroWidthPx) {
		return true;
	    }
	} else if (coords.y > colDendroHeightPx) {
	    if  ((type == "colClass") && coords.x > rowClassWidthPx + rowDendroWidthPx) {
		return true;
	    }
	}
	return false;
    }

    /*********************************************************************************************
     * FUNCTION:  getSamplingRatio - This function returns the appropriate row/col sampling ration
     * for the heat map based upon the screen mode.
     *********************************************************************************************/
    function getSamplingRatio (mode,axis) {
	const heatMap = MMGR.getHeatMap();
	const isRow = MMGR.isRow (axis);
	let level;
	switch (mode){
	    case 'RIBBONH': level = MAPREP.RIBBON_HOR_LEVEL;
	    case 'RIBBONV': level = MAPREP.RIBBON_VERT_LEVEL;
	    case 'FULL_MAP': level = isRow ? MAPREP.RIBBON_VERT_LEVEL : MAPREP.RIBBON_HOR_LEVEL;
	    default:        level = MAPREP.DETAIL_LEVEL;
	}

	if (isRow) {
	    return heatMap.getRowSummaryRatio(level);
	} else {
	    return heatMap.getColSummaryRatio(level);
	}
    }

/*********************************************************************************************
 * FUNCTION:  handleMouseMove - The purpose of this function is to handle a user drag event.
 * The type of move (drag-move or drag-select is determined, based upon keys pressed and the
 * appropriate function is called to perform the function.
 *********************************************************************************************/
DEV.handleMouseMove = function (e) {
    const mapItem = DVW.getMapItemFromCanvas(e.currentTarget);
    // Do not clear help if the mouse position did not change. Repeated firing of the mousemove event can happen on random
    // machines in all browsers but FireFox. There are varying reasons for this so we check and exit if need be.
    const eX = e.touches ? e.touches[0].clientX : e.clientX;
    const eY = e.touches ? e.touches[0].clientY : e.clientY;
    if(mapItem.oldMousePos[0] != eX ||mapItem.oldMousePos[1] != eY) {
	mapItem.oldMousePos = [eX, eY];
    }
    if (mouseDown && mouseEventActive) {
	clearTimeout(DET.eventTimer);
	//If mouse is down and shift key is pressed, perform a drag selection
	//Else perform a drag move
	if (e.shiftKey) {
	    //process select drag only if the mouse is down AND the cursor is on the heat map.
	    if((mouseDown) && (isOnObject(e,"map"))) {
		SRCH.clearSearch(e);
		DEV.handleSelectDrag(e);
	    }
	}
	else {
	    DEV.handleMoveDrag(e);
	}
    }
};

/*********************************************************************************************
 * FUNCTION:  handleMoveDrag - The purpose of this function is to handle a user "move drag" 
 * event.  This is when the user clicks and drags across the detail heat map viewport. When 
 * this happens, the current position of the heatmap viewport is changed and the detail heat 
 * map is redrawn 
 *********************************************************************************************/
DEV.handleMoveDrag = function (e) {
	const mapItem = DVW.getMapItemFromCanvas(e.currentTarget);
    if(!mouseDown) return;
    mapItem.canvas.style.cursor="move"; 
    const rowElementSize = mapItem.dataBoxWidth * mapItem.canvas.clientWidth/mapItem.canvas.width;
    const colElementSize = mapItem.dataBoxHeight * mapItem.canvas.clientHeight/mapItem.canvas.height;
    if (e.touches){  //If more than 2 fingers on, don't do anything
    	if (e.touches.length > 1){
    		return false;
    	}
    } 
    const coords = UTIL.getCursorPosition(e);
    const xDrag = coords.x - mapItem.dragOffsetX;
    const yDrag = coords.y - mapItem.dragOffsetY;
    if ((Math.abs(xDrag/rowElementSize) > 1) || (Math.abs(yDrag/colElementSize) > 1)) {
    	//Disregard vertical movement if the cursor is not on the heat map.
		if (!isOnObject(e,"colClass")) {
			mapItem.currentRow = Math.round(mapItem.currentRow - (yDrag/colElementSize));
			mapItem.dragOffsetY = coords.y;
		}
		if (!isOnObject(e,"rowClass")) {
			mapItem.currentCol = Math.round(mapItem.currentCol - (xDrag/rowElementSize));
			mapItem.dragOffsetX = coords.x;  //canvas X coordinate 
		}
	    DVW.checkRow(mapItem);
	    DVW.checkCol(mapItem);
	    mapItem.updateSelection();
    } 
}	

/*********************************************************************************************
 * FUNCTION:  handleSelectDrag - The purpose of this function is to handle a user "select drag" 
 * event.  This is when the user clicks, holds down the SHIFT key, and drags across the detail 
 * heat map viewport. Starting and ending row/col positions are calculated and the row/col 
 * search items arrays are populated with those positions (representing selected items on each 
 * axis).  Finally, selection markson the Summary heatmap are drawn and the detail heat map is 
 * re-drawn 
 *********************************************************************************************/
DEV.handleSelectDrag = function (e) {
	const mapItem = DVW.getMapItemFromCanvas(e.currentTarget);
	mapItem.canvas.style.cursor="crosshair";
	const rowElementSize = mapItem.dataBoxWidth * mapItem.canvas.clientWidth/mapItem.canvas.width;
	const colElementSize = mapItem.dataBoxHeight * mapItem.canvas.clientHeight/mapItem.canvas.height;
    if (e.touches){  //If more than 2 fingers on, don't do anything
    	if (e.touches.length > 1){
    		return false;
    	}
    }
    const coords = UTIL.getCursorPosition(e);
    const xDrag = e.touches ? e.touches[0].layerX - mapItem.dragOffsetX : coords.x - mapItem.dragOffsetX;
    const yDrag = e.touches ? e.touches[0].layerY - mapItem.dragOffsetY : coords.y - mapItem.dragOffsetY;
   
    if ((Math.abs(xDrag/rowElementSize) > 1) || (Math.abs(yDrag/colElementSize) > 1)) {
    	//Retrieve drag corners but set to max/min values in case user is dragging
    	//bottom->up or left->right.
	const endRow = Math.max(DEV.getRowFromLayerY(mapItem, coords.y),DEV.getRowFromLayerY(mapItem, mapItem.dragOffsetY));
	const endCol = Math.max(DEV.getColFromLayerX(mapItem, coords.x),DEV.getColFromLayerX(mapItem, mapItem.dragOffsetX));
	const startRow = Math.min(DEV.getRowFromLayerY(mapItem, coords.y),DEV.getRowFromLayerY(mapItem, mapItem.dragOffsetY));
	const startCol = Math.min(DEV.getColFromLayerX(mapItem, coords.x),DEV.getColFromLayerX(mapItem, mapItem.dragOffsetX));
	SRCH.clearSearch(e);
	SRCH.setAxisSearchResults ("Row", startRow, endRow);
	SRCH.setAxisSearchResults ("Column", startCol, endCol);
        SUM.drawSelectionMarks();
        SUM.drawTopItems();
        DET.updateDisplayedLabels();
        DET.drawSelections();
        SRCH.updateLinkoutSelections();
        SUM.redrawCanvases();
    }
}	

/*********************************************************************************************
 * FUNCTIONS:  getRowFromLayerY AND getColFromLayerX -  The purpose of this function is to 
 * retrieve the row/col in the data matrix that matched a given mouse location.  They utilize 
 * event.layerY/X for the mouse position.
 *********************************************************************************************/
DEV.getRowFromLayerY = function (mapItem,layerY) {
	const colElementSize = mapItem.dataBoxHeight * mapItem.canvas.clientHeight/mapItem.canvas.height;
	const colClassHeightPx = DET.getColClassPixelHeight(mapItem);
	const mapLocY = layerY - colClassHeightPx;
	return Math.floor(mapItem.currentRow + (mapLocY/colElementSize)*getSamplingRatio(mapItem.mode,'row'));
}

DEV.getColFromLayerX = function (mapItem,layerX) {
	const rowElementSize = mapItem.dataBoxWidth * mapItem.canvas.clientWidth/mapItem.canvas.width; // px/Glpoint
	const rowClassWidthPx = DET.getRowClassPixelWidth(mapItem);
	const mapLocX = layerX - rowClassWidthPx;
	return Math.floor(mapItem.currentCol + (mapLocX/rowElementSize)*getSamplingRatio(mapItem.mode,'col'));
}



/**********************************************************************************
 * FUNCTION - detailDataZoomIn: The purpose of this function is to handle all of
 * the processing necessary to zoom inwards on a given heat map panel.
 *
 * Zooming out may change the user-selected mode from normal mode, to a ribbon mode,
 * eventually to full map mode.  To enable the user-selected mode to be restored on
 * zoom in, each zoom out pushes the zoom mode onto a stack which is used here to
 * determine if we should undo the automatic changes in zoom mode.  Explicit user
 * changes to the zoom mode will clear the mode history.
 **********************************************************************************/
DEV.detailDataZoomIn = function (mapItem) {
	UHM.hlpC();
	LNK.labelHelpCloseAll();
	if (!mapItem.modeHistory) mapItem.modeHistory = [];
	if (mapItem.mode == 'FULL_MAP') {
	        let mode = mapItem.mode, row=1, col=1;
		if (mapItem.modeHistory.length > 0) {
		        ({ mode, row, col } = mapItem.modeHistory[mapItem.modeHistory.length-1]);
		}
		if ((mode == 'RIBBONH') || (mode == 'RIBBONH_DETAIL')) {
			mapItem.currentRow = row;
			DEV.detailHRibbonButton(mapItem);
		} else if  ((mode == 'RIBBONV') || (mode == 'RIBBONV_DETAIL')) {
			mapItem.currentCol = col;
			DEV.detailVRibbonButton(mapItem);
		} else {
			mapItem.saveRow = row;
			mapItem.saveCol = col;
			DEV.detailNormal(mapItem);
		}
		mapItem.modeHistory.pop();
	} else if (mapItem.mode == 'NORMAL') {
		if (mapItem.modeHistory.length > 0) {
		        mapItem.modeHistory = [];
		}
		let current = DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth);
		if (current < DET.zoomBoxSizes.length - 1) {
			let zoomBoxSize = DET.zoomBoxSizes[current+1];
			DET.setDetailDataSize (mapItem, zoomBoxSize);
		}
		mapItem.updateSelection(false);
	} else if ((mapItem.mode == 'RIBBONH') || (mapItem.mode == 'RIBBONH_DETAIL')) {
	        let mode = mapItem.mode, col;
		if (mapItem.modeHistory.length > 0) {
		    ({ mode, col } = mapItem.modeHistory[mapItem.modeHistory.length-1]);
		    if (mode == 'NORMAL') {
		        mapItem.saveCol = col;
		    }
		}
		if (mode == 'NORMAL') {
			DEV.detailNormal (mapItem);
		} else {
			let current = DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight);
			if (current == -1) {
			    //On some maps, one view (e.g. ribbon view) can show bigger data areas than will fit for other view modes.  If so, zoom back out to find a workable zoom level.
			    const heatMap = MMGR.getHeatMap();
			    mapItem.dataBoxHeight = DET.zoomBoxSizes[0];
			    mapItem.dataViewHeight = DET.SIZE_NORMAL_MODE;
			    while (Math.floor((mapItem.dataViewHeight-DET.dataViewBorder)/DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight)]) >= heatMap.getNumRows(MAPREP.DETAIL_LEVEL)) {
				DET.setDetailDataHeight(mapItem,DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight)+1]);
			    }
			    mapItem.canvas.width =  (mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row"));
			    mapItem.canvas.height = (mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column"));

			    DET.detInitGl(mapItem);
			} else if (current < DET.zoomBoxSizes.length - 1) {
				DET.setDetailDataHeight (mapItem,DET.zoomBoxSizes[current+1]);
			}
			mapItem.updateSelection(false);
		}
		mapItem.modeHistory.pop();
	} else if ((mapItem.mode == 'RIBBONV') || (mapItem.mode == 'RIBBONV_DETAIL')) {
	        let mode = mapItem.mode, row;
		if (mapItem.modeHistory.length > 0) {
		    ({ mode, row } = mapItem.modeHistory[mapItem.modeHistory.length-1]);
		    if (mode == 'NORMAL') {
		        mapItem.saveRow = row;
		    }
		}
		if (mode == 'NORMAL') {
			DEV.detailNormal (mapItem);
		} else {
			let current = DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth);
			if (current == -1) {
			    //On some maps, one view (e.g. ribbon view) can show bigger data areas than will fit for other view modes.  If so, zoom back out to find a workable zoom level.
			    const heatMap = MMGR.getHeatMap();
			    mapItem.dataBoxWidth = DET.zoomBoxSizes[0];
			    mapItem.dataViewWidth = DET.SIZE_NORMAL_MODE;
			    while (Math.floor((mapItem.dataViewWidth-DET.dataViewBorder)/DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth)]) >= heatMap.getNumColumns(MAPREP.DETAIL_LEVEL)) {
				DET.setDetailDataWidth(mapItem,DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth)+1]);
			    }
			    mapItem.canvas.width =  (mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row"));
			    mapItem.canvas.height = (mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column"));

			    DET.detInitGl(mapItem);
			} else if (current < DET.zoomBoxSizes.length - 1) {
			    DET.setDetailDataWidth(mapItem,DET.zoomBoxSizes[current+1]);
			}
			mapItem.updateSelection(false);
		}
		mapItem.modeHistory.pop();
	}
};

/**********************************************************************************
 * FUNCTION - detailDataZoomOut: The purpose of this function is to handle all of
 * the processing necessary to zoom outwards on a given heat map panel.
 **********************************************************************************/
DEV.detailDataZoomOut = function (chm) {
	const heatMap = MMGR.getHeatMap();
	const mapItem = DVW.getMapItemFromChm(chm);
	if (mapItem.mode == 'FULL_MAP') {
	    // Already in full map view. We actually can't zoom out any further.
	    return;
	}
	UHM.hlpC();
	LNK.labelHelpCloseAll();
	if (!mapItem.modeHistory) mapItem.modeHistory = [];
	mapItem.modeHistory.push ({ mode: mapItem.mode, row: mapItem.currentRow, col: mapItem.currentCol });
	if (mapItem.mode == 'NORMAL') {
		const current = DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth);
		if ((current > 0) &&
		    (Math.floor((mapItem.dataViewHeight-DET.dataViewBorder)/DET.zoomBoxSizes[current-1]) <= heatMap.getNumRows(MAPREP.DETAIL_LEVEL)) &&
		    (Math.floor((mapItem.dataViewWidth-DET.dataViewBorder)/DET.zoomBoxSizes[current-1]) <= heatMap.getNumColumns(MAPREP.DETAIL_LEVEL))){
			DET.setDetailDataSize (mapItem,DET.zoomBoxSizes[current-1]);
			mapItem.updateSelection();
		} else {
			//If we can't zoom out anymore see if ribbon mode would show more of the map or , switch to full map view.
			if ((current > 0) && (heatMap.getNumRows(MAPREP.DETAIL_LEVEL) <= heatMap.getNumColumns(MAPREP.DETAIL_LEVEL)) ) {
				DEV.detailVRibbonButton(mapItem);
			} else if ((current > 0) && (heatMap.getNumRows(MAPREP.DETAIL_LEVEL) > heatMap.getNumColumns(MAPREP.DETAIL_LEVEL)) ) {
				DEV.detailHRibbonButton(mapItem);
			} else {
				DEV.detailFullMap(mapItem);
			}	
		}	
	} else if ((mapItem.mode == 'RIBBONH') || (mapItem.mode == 'RIBBONH_DETAIL')) {
		const current = DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight);
		if ((current > 0) &&
		    (Math.floor((mapItem.dataViewHeight-DET.dataViewBorder)/DET.zoomBoxSizes[current-1]) <= heatMap.getNumRows(MAPREP.DETAIL_LEVEL))) {
			// Additional zoom out in ribbon mode.
			DET.setDetailDataHeight (mapItem,DET.zoomBoxSizes[current-1]);
			mapItem.updateSelection();
		} else {
			// Switch to full map view.
			DEV.detailFullMap(mapItem);
		}	
	} else if ((mapItem.mode == 'RIBBONV') || (mapItem.mode == 'RIBBONV_DETAIL')) {
		const current = DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth);
		if ((current > 0) &&
		    (Math.floor((mapItem.dataViewWidth-DET.dataViewBorder)/DET.zoomBoxSizes[current-1]) <= heatMap.getNumColumns(MAPREP.DETAIL_LEVEL))){
			// Additional zoom out in ribbon mode.
			DET.setDetailDataWidth (mapItem,DET.zoomBoxSizes[current-1]);
			mapItem.updateSelection();
		} else {
			// Switch to full map view.
			DEV.detailFullMap(mapItem);
		}	
        } else {
	    console.error ('Unknown zoom mode ', mapItem.mode);
	}
};

/**********************************************************************************
 * FUNCTION - callDetailDrawFunction: The purpose of this function is to respond to
 * mode changes on the Summary Panel by calling the appropriate detail drawing
 * function. It acts only on the Primary heat map pane.
 **********************************************************************************/
DEV.callDetailDrawFunction = function(modeVal, target) {
	let mapItem = (typeof target !== 'undefined') ? target : DVW.primaryMap;
	if (!mapItem) return;
	if (modeVal == 'RIBBONH' || modeVal == 'RIBBONH_DETAIL')
		DEV.detailHRibbon(mapItem);
	if (modeVal == 'RIBBONV' || modeVal == 'RIBBONV_DETAIL')
		DEV.detailVRibbon(mapItem);
	if (modeVal == 'FULL_MAP')
		DEV.detailFullMap(mapItem);
	if (modeVal == 'NORMAL') {
		DEV.detailNormal(mapItem);
	}
}

/***********************************************************************************
 * FUNCTION - clearModeHistory: Clears mode history.  Should be done every time the
 * user explicitly changes the zoom mode.
 ***********************************************************************************/
DEV.clearModeHistory = function (mapItem) {
	mapItem.modeHistory = [];
};

/**********************************************************************************
 * FUNCTION - detailNormal: The purpose of this function is to handle all of
 * the processing necessary to return a heat map panel to normal mode.
 * mapItem is the detail view map item.
 **********************************************************************************/
DEV.detailNormal = function (mapItem, restoreInfo) {
	UHM.hlpC();
	const previousMode = mapItem.mode;
	DVW.setMode(mapItem,'NORMAL');
	mapItem.setButtons();
	if (!restoreInfo) {
	    mapItem.dataViewHeight = DET.SIZE_NORMAL_MODE;
	    mapItem.dataViewWidth = DET.SIZE_NORMAL_MODE;
	    if ((previousMode=='RIBBONV') || (previousMode=='RIBBONV_DETAIL')) {
		DET.setDetailDataSize(mapItem, mapItem.dataBoxWidth);
	    } else if ((previousMode=='RIBBONH') || (previousMode=='RIBBONH_DETAIL')) {
		DET.setDetailDataSize(mapItem,mapItem.dataBoxHeight);
	    } else if (previousMode=='FULL_MAP') {
		DET.setDetailDataSize(mapItem,DET.zoomBoxSizes[0]);
	    }

	    //On some maps, one view (e.g. ribbon view) can show bigger data areas than will fit for other view modes.  If so, zoom back out to find a workable zoom level.
	    const heatMap = MMGR.getHeatMap();
	    while ((Math.floor((mapItem.dataViewHeight-DET.dataViewBorder)/DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight)]) > heatMap.getNumRows(MAPREP.DETAIL_LEVEL)) ||
	       (Math.floor((mapItem.dataViewWidth-DET.dataViewBorder)/DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth)]) > heatMap.getNumColumns(MAPREP.DETAIL_LEVEL))) {
		DET.setDetailDataSize(mapItem, DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth)+1]);
	    }
	
	    if ((previousMode=='RIBBONV') || (previousMode=='RIBBONV_DETAIL')) {
		mapItem.currentRow = mapItem.saveRow;
	    } else if ((previousMode=='RIBBONH') || (previousMode=='RIBBONH_DETAIL')) {
		mapItem.currentCol = mapItem.saveCol;
	    } else if (previousMode=='FULL_MAP') {
		mapItem.currentRow = mapItem.saveRow;
		mapItem.currentCol = mapItem.saveCol;		
	    }
	}
	
	DVW.checkRow(mapItem);
	DVW.checkCol(mapItem);
	mapItem.canvas.width =  (mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row"));
	mapItem.canvas.height = (mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column"));
	 
	DET.detInitGl(mapItem);
	DDR.clearDendroSelection();
	mapItem.updateSelection();
	try {
		document.getElementById("viewport").setAttribute("content", "height=device-height");
		document.getElementById("viewport").setAttribute("content", "");
	} catch(err) {
		console.error("Unable to adjust viewport content attribute");
	}
}

/**********************************************************************************
 * FUNCTION - detailFullMap: The purpose of this function is to show the whole map 
 * in the detail pane. Processes ribbon h/v differently. In these cases, one axis 
 * is kept static so that the "full view" stays within the selected sub-dendro.
 **********************************************************************************/
DEV.detailFullMap = function (mapItem) {
	UHM.hlpC();
	mapItem.saveRow = mapItem.currentRow;
	mapItem.saveCol = mapItem.currentCol;
	
	//For maps that have less rows/columns than the size of the detail panel, matrix elements get height / width more 
	//than 1 pixel, scale calculates the appropriate height/width.
	if (mapItem.subDendroMode === 'Column') {
	    DET.scaleViewHeight(mapItem);
	} else if (mapItem.subDendroMode === 'Row') {
	    DET.scaleViewWidth(mapItem);
	} else {
	    DVW.setMode(mapItem, 'FULL_MAP');
	    DET.scaleViewHeight(mapItem);
	    DET.scaleViewWidth(mapItem);
	}

	//Canvas is adjusted to fit the number of rows/columns and matrix height/width of each element.
	mapItem.canvas.width =  (mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row"));
	mapItem.canvas.height = (mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column"));
	DET.detInitGl(mapItem);
	mapItem.updateSelection();
}

/**********************************************************************************
 * FUNCTION - detailHRibbonButton: The purpose of this function is to clear dendro
 * selections and call processing to change to Horizontal Ribbon Mode.
 **********************************************************************************/
DEV.detailHRibbonButton = function (mapItem) {
	DDR.clearDendroSelection(mapItem);
	DEV.detailHRibbon(mapItem);
}

/**********************************************************************************
 * FUNCTION - detailHRibbon: The purpose of this function is to change the view for
 * a given heat map panel to horizontal ribbon view.  Note there is a standard full 
 * ribbon view and also a sub-selection ribbon view if the user clicks on the dendrogram.  
 * If a dendrogram selection is in effect, then selectedStart and selectedStop will be set.
 **********************************************************************************/
DEV.detailHRibbon = function (mapItem, restoreInfo) {
	UHM.hlpC();
	const heatMap = MMGR.getHeatMap();
	const previousMode = mapItem.mode;
	const prevWidth = mapItem.dataBoxWidth;
	mapItem.saveCol = mapItem.currentCol;
	DVW.setMode(mapItem,'RIBBONH');
	mapItem.setButtons();

	if (!restoreInfo) {
	    if (previousMode=='FULL_MAP') {
		DET.setDetailDataHeight(mapItem, DET.zoomBoxSizes[0]);
	    }
	    // If normal (full) ribbon, set the width of the detail display to the size of the horizontal ribbon view
	    // and data size to 1.
	    if (mapItem.selectedStart == null || mapItem.selectedStart == 0) {
		mapItem.dataViewWidth = heatMap.getNumColumns(MAPREP.RIBBON_HOR_LEVEL) + DET.dataViewBorder;
		let ddw = 1;
		while(2*mapItem.dataViewWidth < 500){ // make the width wider to prevent blurry/big dendros for smaller maps
			ddw *=2;
			mapItem.dataViewWidth = ddw*heatMap.getNumColumns(MAPREP.RIBBON_HOR_LEVEL) + DET.dataViewBorder;
		}
		DET.setDetailDataWidth(mapItem,ddw);
		mapItem.currentCol = 1;
	    } else {
		mapItem.saveCol = mapItem.selectedStart;
		let selectionSize = mapItem.selectedStop - mapItem.selectedStart + 1;
		DEV.clearModeHistory (mapItem);
		mapItem.mode='RIBBONH_DETAIL'
		const width = Math.max(1, Math.floor(500/selectionSize));
		mapItem.dataViewWidth = (selectionSize * width) + DET.dataViewBorder;
		DET.setDetailDataWidth(mapItem,width);
		mapItem.currentCol = mapItem.selectedStart;
	    }
	
	    mapItem.dataViewHeight = DET.SIZE_NORMAL_MODE;
	    if ((previousMode=='RIBBONV') || (previousMode == 'RIBBONV_DETAIL') || (previousMode == 'FULL_MAP')) {
		if (previousMode == 'FULL_MAP') {
		    DET.setDetailDataHeight(mapItem,DET.zoomBoxSizes[0]);
		} else {
		    DET.setDetailDataHeight(mapItem,prevWidth);
		}
		mapItem.currentRow = mapItem.saveRow;
	    }

	    //On some maps, one view (e.g. ribbon view) can show bigger data areas than will fit for other view modes.  If so, zoom back out to find a workable zoom level.
	    while (Math.floor((mapItem.dataViewHeight-DET.dataViewBorder)/DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight)]) > heatMap.getNumRows(MAPREP.DETAIL_LEVEL)) {
		DET.setDetailDataHeight(mapItem,DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight)+1]);
	    }
	}

	mapItem.canvas.width =  (mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row"));
	mapItem.canvas.height = (mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column"));
	DET.detInitGl(mapItem);
	mapItem.updateSelection();
}

/**********************************************************************************
 * FUNCTION - detailVRibbonButton: The purpose of this function is to clear dendro
 * selections and call processing to change to Vertical Ribbon Mode.
 **********************************************************************************/
DEV.detailVRibbonButton = function (mapItem) {
	DDR.clearDendroSelection(mapItem);
	DEV.detailVRibbon(mapItem);
}

/**********************************************************************************
 * FUNCTION - detailVRibbon: The purpose of this function is to change the view for
 * a given heat map panel to vertical ribbon view.  Note there is a standard full 
 * ribbon view and also a sub-selection ribbon view if the user clicks on the dendrogram.  
 * If a dendrogram selection is in effect, then selectedStart and selectedStop will be set.
 **********************************************************************************/
DEV.detailVRibbon = function (mapItem, restoreInfo) {
	UHM.hlpC();
	const heatMap = MMGR.getHeatMap();
	const previousMode = mapItem.mode;
	const prevHeight = mapItem.dataBoxHeight;
	mapItem.saveRow = mapItem.currentRow;
	
	DVW.setMode(mapItem, 'RIBBONV');
	mapItem.setButtons();

	// If normal (full) ribbon, set the width of the detail display to the size of the horizontal ribbon view
	// and data size to 1.
	if (mapItem.selectedStart == null || mapItem.selectedStart == 0) {
		mapItem.dataViewHeight = heatMap.getNumRows(MAPREP.RIBBON_VERT_LEVEL) + DET.dataViewBorder;
		let ddh = 1;
		while(2*mapItem.dataViewHeight < 500){ // make the height taller to prevent blurry/big dendros for smaller maps
			ddh *=2;
			mapItem.dataViewHeight = ddh*heatMap.getNumRows(MAPREP.RIBBON_VERT_LEVEL) + DET.dataViewBorder;
		}
		DET.setDetailDataHeight(mapItem,ddh);
		mapItem.currentRow = 1;
	} else {
		mapItem.saveRow = mapItem.selectedStart;
		let selectionSize = mapItem.selectedStop - mapItem.selectedStart + 1;
		if (selectionSize < 500) {
			DEV.clearModeHistory (mapItem);
			DVW.setMode(mapItem, 'RIBBONV_DETAIL');
		} else {
			const rvRate = heatMap.getRowSummaryRatio(MAPREP.RIBBON_VERT_LEVEL);
			selectionSize = Math.floor(selectionSize / rvRate);			
		}
		const height = Math.max(1, Math.floor(500/selectionSize));
		mapItem.dataViewHeight = (selectionSize * height) + DET.dataViewBorder;
		DET.setDetailDataHeight(mapItem, height);
		mapItem.currentRow = mapItem.selectedStart;
	}
	
	if (!restoreInfo) {
	    mapItem.dataViewWidth = DET.SIZE_NORMAL_MODE;
	    if ((previousMode=='RIBBONH') || (previousMode=='RIBBONH_DETAIL') || (previousMode == 'FULL_MAP')) {
		if (previousMode == 'FULL_MAP') {
			DET.setDetailDataWidth(mapItem, DET.zoomBoxSizes[0]);
		} else {
			DET.setDetailDataWidth(mapItem, prevHeight);
		}
		mapItem.currentCol = mapItem.saveCol;
	    }
	
	    //On some maps, one view (e.g. ribbon view) can show bigger data areas than will fit for other view modes.  If so, zoom back out to find a workable zoom level.
	    while (Math.floor((mapItem.dataViewWidth-DET.dataViewBorder)/DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth)]) > heatMap.getNumColumns(MAPREP.DETAIL_LEVEL)) {
		DET.setDetailDataWidth(mapItem,DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth)+1]);
	    }
	}

	mapItem.canvas.width =  (mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row"));
	mapItem.canvas.height = (mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column"));
	DET.detInitGl(mapItem);
	mapItem.updateSelection();
	try {
		document.getElementById("viewport").setAttribute("content", "height=device-height");
		document.getElementById("viewport").setAttribute("content", "");
	} catch(err) {
		console.error("Unable to adjust viewport content attribute");
	}
}

/**********************************************************************************
 * FUNCTION - zoomAnimation: The purpose of this function is to perform a zoom 
 * animation when users are zooming out on a given heat map canvas.
 **********************************************************************************/
DEV.zoomAnimation = function (chm,destRow,destCol) {
	const mapItem = DVW.getMapItemFromChm(chm);
	// set proportion variables for heatmap canvas
	const detViewW = mapItem.dataViewWidth;
	const detViewH = mapItem.dataViewHeight;
	const classBarW = DET.calculateTotalClassBarHeight("row");
	const classBarH = DET.calculateTotalClassBarHeight("column");
	const dendroW = mapItem.dendroWidth;
	const dendroH = mapItem.dendroHeight;
	const rowTotalW = detViewW + classBarW;
	const colTotalH = detViewH + classBarH;
	const mapWRatio = detViewW / rowTotalW;
	const mapHRatio = detViewH / colTotalH;
	const dendroClassWRatio = 1 - mapWRatio;
	const dendroClassHRatio = 1 - mapHRatio;
	
	const currentWIndex = DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth);
	const currentHIndex = DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight);
	const currentW = mapItem.dataBoxWidth;
	const currentH = mapItem.dataBoxHeight;
	const nextW = DET.zoomBoxSizes[currentWIndex+1];
	const nextH = DET.zoomBoxSizes[currentHIndex+1];
	const currentNumCols = (detViewW-2)/currentW;
	const currentNumRows = (detViewH-2)/currentH;
	
	const nextNumCols = (detViewW-2)/nextW;
	const nextNumRows = (detViewH-2)/nextH;
	
	// this is the percentage to zoom in by
	const zoomRatioW = (1-(nextNumCols/currentNumCols))*mapWRatio;
	const zoomRatioH = (1-(nextNumRows/currentNumRows))*mapHRatio; 
	
	// set proportion variables for box canvas
	const boxCtx = mapItem.boxCanvas.getContext("2d");
	const boxW = boxCtx.canvas.width;
	const boxH = boxCtx.canvas.height;
	
	
	// if we can't go in any further, don't proceed
	if ((mapItem.mode !== "RIBBONH" && nextW == undefined) || (mapItem.mode !== "RIBBONV" && nextH == undefined) || DET.animating == true){
		return;
	}
	boxCtx.clearRect(0, 0, boxCtx.canvas.width, boxCtx.canvas.height);
	let animationZoomW = 0;
	let animationZoomH = 0;
	let animateCount = 0;
	let animateCountMax = 10;
	
	animate(mapItem,destRow,destCol);
	function getAnimate(){
		animate(mapItem,destRow,destCol);
	}
	function animate(mapItem,destRow,destCol){
		const heatMap = MMGR.getHeatMap();
		DET.animating = true;

		DET.detInitGl (mapItem);
		// create new buffer to draw over the current map

		if (animateCount < animateCountMax) { // do we keep animating?
			animateCount++;
			if (!mapItem.mode.includes("RIBBONH")){
				animationZoomW += zoomRatioW/animateCountMax;
			}
			if (!mapItem.mode.includes("RIBBONV")){
				animationZoomH += zoomRatioH/animateCountMax;
			}
			let texBottom, texLeft, texTop, texRight;;
			if (mapItem.mode == "FULL_MAP"){
				let saveRow = mapItem.saveRow;
				let saveCol = mapItem.saveCol;
				if (destRow && destCol){
					saveRow = destRow*heatMap.getRowSummaryRatio("s");
					saveCol = destCol*heatMap.getColSummaryRatio("s");
				}
				let detWidth = DET.SIZE_NORMAL_MODE-DET.paddingHeight;
				let detHeight = DET.SIZE_NORMAL_MODE-DET.paddingHeight;
				if ((DET.SIZE_NORMAL_MODE-DET.paddingHeight) > heatMap.getNumRows("d")){
					for (let i = 0; i<DET.zoomBoxSizes.length; i++){
						if ((DET.SIZE_NORMAL_MODE-DET.paddingHeight)/DET.zoomBoxSizes[i] < heatMap.getNumRows("d")){
							detHeight = (DET.SIZE_NORMAL_MODE-DET.paddingHeight)/DET.zoomBoxSizes[i];
							break;
						}
					}
				}
				
				if ((DET.SIZE_NORMAL_MODE-DET.paddingHeight) > heatMap.getNumColumns("d")){
					for (let i = 0;i< DET.zoomBoxSizes.length; i++){
						if ((DET.SIZE_NORMAL_MODE-DET.paddingHeight)/DET.zoomBoxSizes[i] < heatMap.getNumColumns("d")){
							detWidth = (DET.SIZE_NORMAL_MODE-DET.paddingHeight)/DET.zoomBoxSizes[i];
							break;
						}
					}
				}
				
				const detNum = Math.min(detWidth,detHeight);
				if (destRow && destCol){
					saveRow = Math.max(1,saveRow-detNum/2);
					saveCol = Math.max(1,saveCol-detNum/2);
					mapItem.saveRow = saveRow;
					mapItem.saveCol = saveCol;
				}
								
				//TODO: do we need to account for summary ratio???
				const leftRatio=(saveCol-1)*mapWRatio /mapItem.dataPerRow /animateCountMax/heatMap.getColSummaryRatio("d");
				const rightRatio=Math.max(0,(DVW.getCurrentDetDataPerRow(mapItem)*heatMap.getColSummaryRatio("d")-saveCol-1-detNum)*mapWRatio /DVW.getCurrentDetDataPerRow(mapItem) /animateCountMax/heatMap.getColSummaryRatio("d")); // this one works for maps that are not too big!!
				const topRatio = (saveRow-1)*mapHRatio /mapItem.dataPerCol /animateCountMax/heatMap.getRowSummaryRatio("d");
				const bottomRatio = Math.max(0,(DVW.getCurrentDetDataPerCol(mapItem)*heatMap.getRowSummaryRatio("d")-saveRow-1-detNum)*mapHRatio   /DVW.getCurrentDetDataPerCol(mapItem) /animateCountMax/heatMap.getRowSummaryRatio("d")); // this one works for maps that are not too big!
				
				texLeft = dendroClassWRatio+animateCount*leftRatio;
			        texBottom = animateCount*bottomRatio;
			        texRight = 1-animateCount*rightRatio;
			        texTop = mapHRatio-animateCount*topRatio;
			} else if ((currentNumRows-nextNumRows)%2 == 0){ // an even number of data points are going out of view
				// we zoom the same amount from the top/left as the bottom/right
				// (0,0) is the bottom left corner, (1,1) is the top right
				texLeft = dendroClassWRatio+animationZoomW/2;
			        texBottom = animationZoomH/2;
			        texRight = 1-animationZoomW/2;
			        texTop = mapHRatio-animationZoomH/2;
			} else { // an odd number of data points are going out of view (ie: if the difference in points shown is 9, move 4 from the top/left, move 5 from the bottom/right)
				// we zoom one less point on the top/left than we do the bottom/right
				const rowDiff = currentNumRows-nextNumRows;
				const colDiff = currentNumCols-nextNumCols;
				const topRatio = Math.floor(rowDiff/2)/rowDiff;
				const bottomRatio = Math.ceil(rowDiff/2)/rowDiff;
				const leftRatio = Math.floor(colDiff/2)/colDiff;
				const rightRatio = Math.ceil(colDiff/2)/colDiff;
				texLeft = dendroClassWRatio+animationZoomW*leftRatio;
			        texBottom = animationZoomH*bottomRatio;
			        texRight = 1-animationZoomW*rightRatio;
			        texTop = mapHRatio-animationZoomH*topRatio;
			}
			
			requestAnimationFrame(getAnimate);
			// draw the updated animation map
			if (mapItem.glManager.OK) {
				// Set the clip region to just the matrix area.
				// (-1,-1 is the bottom left corner of the detail canvas, (1,1) is the top right corner
			        const right = 1;
				const bottom = -1;
			        const left = -1 + 2 * dendroClassWRatio;
			        const top = 1 - 2 * dendroClassHRatio;
				mapItem.glManager.setClipRegion (DRAW.GL.rectToTriangles(bottom,left,top,right));
				mapItem.glManager.setTextureRegion (DRAW.GL.rectToTriangles(texBottom,texLeft,texTop,texRight));
				mapItem.glManager.drawTexture ();
			}
		} else { // animation stops and actual zoom occurs
			animationZoomW = 0;
			animationZoomH = 0;
			if (mapItem.glManager.OK) {
			    const ctx = mapItem.glManager.context;
			    ctx.clear(ctx.COLOR_BUFFER_BIT);
			    mapItem.glManager.setClipRegion (DRAW.GL.fullClipSpace);
			    mapItem.glManager.setTextureRegion (DRAW.GL.fullTextureSpace);
			}
			DEV.detailDataZoomIn(mapItem);
			DET.animating = false;

		}	
	}

}

    /**********************************************************************************
     * FUNCTION - locateHelpBox: This function determines and sets the location of a
     * popup help box.
     **********************************************************************************/
    function locateHelpBox (helptext, mapItem) {
	var rowClassWidthPx = DET.getRowClassPixelWidth(mapItem);
	var colClassHeightPx = DET.getColClassPixelHeight(mapItem);
	    var mapLocY = mapItem.offsetY - colClassHeightPx;
	    var mapLocX = mapItem.offsetX - rowClassWidthPx;
	    var mapH = mapItem.canvas.clientHeight - colClassHeightPx;
	    var mapW = mapItem.canvas.clientWidth - rowClassWidthPx;
	    var boxLeft = mapItem.pageX;
	    if (mapLocX > (mapW / 2)) {
		    boxLeft = mapItem.pageX - helptext.clientWidth - 10;
	    }
	    helptext.style.left = boxLeft + 'px';
	    var boxTop = mapItem.pageY;
	    if ((boxTop+helptext.clientHeight) > mapItem.canvas.clientHeight + 90) {
		    if (helptext.clientHeight > mapItem.pageY) {
			    boxTop = mapItem.pageY - (helptext.clientHeight/2);
		    } else {
			    boxTop = mapItem.pageY - helptext.clientHeight;
		    }
	    }
	    //Keep box from going off top of screen so data values always visible.
	    if (boxTop < 0) {
		    boxTop = 0;
	    }
	    helptext.style.top = boxTop + 'px';
    }

})();
