(function() {
    "use strict";
    NgChm.markFile();

    //Define Namespace for NgChm Events
    const DEV = NgChm.createNS('NgChm.DEV');

    const DMM = NgChm.importNS('NgChm.DMM');
    const DET = NgChm.importNS('NgChm.DET');
    const UTIL = NgChm.importNS('NgChm.UTIL');
    const UHM = NgChm.importNS('NgChm.UHM');
    const SEL = NgChm.importNS('NgChm.SEL');
    const DDR = NgChm.importNS('NgChm.DDR');
    const SRCH = NgChm.importNS('NgChm.SRCH');
    const SUM = NgChm.importNS('NgChm.SUM');
    const LNK = NgChm.importNS('NgChm.LNK');
    const MMGR = NgChm.importNS('NgChm.MMGR');
    const DRAW = NgChm.importNS('NgChm.DRAW');

    DEV.targetCanvas = null;

/**********************************************************************************
 * FUNCTION - addEvents: These function adds event listeners to canvases on a
 * given heat map panel.  
 **********************************************************************************/
DEV.addEvents = function (paneId) {
	const mapItem = DMM.getMapItemFromPane(paneId);
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
			DET.mouseDown = true;
			DET.handleMoveDrag(e);
	    	}
	    }
	}, UTIL.passiveCompat({ capture: false, passive: false }));
	
	mapItem.canvas.addEventListener("touchend", function(e){
		if (e.touches.length == 0){
			DET.mouseDown = false;
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
					UHM.userHelpOpen();
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

/*********************************************************************************************
 * FUNCTION:  handleScroll - The purpose of this function is to handle mouse scroll wheel 
 * events to zoom in / out.
 *********************************************************************************************/
DEV.handleScroll = function(evt) {
	evt.preventDefault();
	let parentElement = evt.target.parentElement;
	if (!parentElement.classList.contains('detail_chm')) {
	        if (!DMM.primaryMap) return;
		parentElement = DMM.primaryMap.chm;
	}
	if (SEL.scrollTime == null || evt.timeStamp - SEL.scrollTime > 150){
		SEL.scrollTime = evt.timeStamp;
		if (evt.wheelDelta < -30 || evt.deltaY > 0 || evt.scale < 1) { //Zoom out
            DEV.detailDataZoomOut(parentElement);
		} else if ((evt.wheelDelta > 30 || evt.deltaY < 0 || evt.scale > 1)){ // Zoom in
            DEV.zoomAnimation(parentElement);
		}	
	}
	return false;
} 		


/*********************************************************************************************
 * FUNCTION:  keyNavigate - The purpose of this function is to handle a user key press event. 
 * As key presses are received at the document level, their detail processing will be routed to
 * the primary detail panel. 
 *********************************************************************************************/
DEV.keyNavigate = function(e) {
	const mapItem = DMM.primaryMap;
	UHM.hlpC();
    clearTimeout(DET.detailPoint);
    if (e.target.type != "text" && e.target.type != "textarea"){
		switch(e.keyCode){ // prevent default added redundantly to each case so that other key inputs won't get ignored
			case 37: // left key 
				if (document.activeElement.id !== "search_text"){
					e.preventDefault();
					if (e.shiftKey){mapItem.currentCol -= mapItem.dataPerRow;} 
					else if (e.ctrlKey){mapItem.currentCol -= 1;mapItem.selectedStart -= 1;mapItem.selectedStop -= 1; DEV.callDetailDrawFunction(mapItem.mode);}
					else {mapItem.currentCol--;}
				}
				break;
			case 38: // up key
				if (document.activeElement.id !== "search_text"){
					e.preventDefault();
					if (e.shiftKey){mapItem.currentRow -= mapItem.dataPerCol;} 
					else if (e.ctrlKey){mapItem.selectedStop += 1; DEV.callDetailDrawFunction(mapItem.mode);}
					else {mapItem.currentRow--;}
				}
				break;
			case 39: // right key
				if (document.activeElement.id !== "search_text"){
					e.preventDefault();
					if (e.shiftKey){mapItem.currentCol += mapItem.dataPerRow;} 
					else if (e.ctrlKey){mapItem.currentCol += 1;mapItem.selectedStart += 1;mapItem.selectedStop += 1; DEV.callDetailDrawFunction(mapItem.mode);} 
					else {mapItem.currentCol++;}
				}
				break;
			case 40: // down key
				if (document.activeElement.id !== "search_text"){
					e.preventDefault();
					if (e.shiftKey){mapItem.currentRow += mapItem.dataPerCol;} 
					else if (e.ctrlKey){mapItem.selectedStop -= 1; DEV.callDetailDrawFunction(mapItem.mode);} 
					else {mapItem.currentRow++;}
				}
				break;
			case 33: // page up
				e.preventDefault();
				if (e.shiftKey){
					let newMode;
					DDR.clearDendroSelection();
					switch(mapItem.mode){
						case "RIBBONV": newMode = 'RIBBONH'; break;
						case "RIBBONH": newMode = 'NORMAL'; break;
						default: newMode = mapItem.mode;break;
					}
					DEV.callDetailDrawFunction(newMode);
				} else {
					DEV.zoomAnimation(mapItem.chm);
				}
				break;
			case 34: // page down 
				e.preventDefault();
				if (e.shiftKey){
					let newMode;
					DDR.clearDendroSelection();
					switch(mapItem.mode){
						case "NORMAL": newMode = 'RIBBONH'; break;
						case "RIBBONH": newMode = 'RIBBONV'; break;
						default: newMode = mapItem.mode;break;
					}
					DEV.callDetailDrawFunction(newMode);
				} else {
					DEV.detailDataZoomOut(mapItem.chm);
				}
				break;
			case 113: // F2 key 
				if (SEL.flickIsOn()) {
					let flickBtn = document.getElementById("flick_btn");
					if (flickBtn.dataset.state === 'flickUp') {
						SEL.flickChange("toggle2");
					} else {
						SEL.flickChange("toggle1");
					}
				}
				break;
			default:
				return;
		}
		SEL.checkRow(mapItem);
		SEL.checkCol(mapItem);
	    SEL.updateSelection(mapItem);
    } else {
    	if ((document.activeElement.id === "search_text") && (e.keyCode === 13)) {
		SRCH.detailSearch();
    	}
    }
	
}

/*********************************************************************************************
 * FUNCTION:  clickStart - The purpose of this function is to handle a user mouse down event.  
 *********************************************************************************************/
DEV.clickStart = function (e) {
	e.preventDefault();
	const mapItem = DMM.getMapItemFromCanvas(e.currentTarget);
	SUM.mouseEventActive = true;
	const clickType = UTIL.getClickType(e);
	UHM.hlpC();
	if (clickType === 0) { 
		const coords = UTIL.getCursorPosition(e);
		mapItem.dragOffsetX = coords.x;  //canvas X coordinate 
		mapItem.dragOffsetY = coords.y;
		DET.mouseDown = true;
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
		DET.eventTimer = setTimeout(UHM.userHelpOpen.bind('mapItem', mapItem), 500);
	}
}

/*********************************************************************************************
 * FUNCTION:  clickEnd - The purpose of this function is to handle a user mouse up event.  
 * If the mouse has not moved out of a given detail row/col between clickStart and clickEnd, 
 * user help is opened for that cell.
 *********************************************************************************************/
DEV.clickEnd = function (e) {
	const mapItem = DMM.getMapItemFromCanvas(e.currentTarget);
	if (SUM.mouseEventActive) {
		const clickType = UTIL.getClickType(e);
		if (clickType === 0) {
			//Reset mouse event indicators
			DET.mouseDown = false;
			//Set cursor back to default
			mapItem.canvas.style.cursor="default";
		}
	}
	SUM.mouseEventActive = false;
}

/*********************************************************************************************
 * FUNCTION:  dblClick -  The purpose of this function is to handle the situation where the 
 * user double-clicks on the detail heat map canvas.  In this case a zoom action is performed.  
 * Zoom in if the shift key is not held down and zoom out if the key is held down.
 *********************************************************************************************/
DEV.dblClick = function(e) {
	const mapItem = DMM.getMapItemFromCanvas(e.currentTarget);
	//turn off single click help if double click
	clearTimeout(DET.eventTimer);
	UHM.hlpC();
	//Get cursor position and convert to matrix row / column
	const rowElementSize = mapItem.dataBoxWidth * mapItem.canvas.clientWidth/mapItem.canvas.width; 
	const colElementSize = mapItem.dataBoxHeight * mapItem.canvas.clientHeight/mapItem.canvas.height;
	const coords = UTIL.getCursorPosition(e);
	const mapLocY = coords.y - DET.getColClassPixelHeight(mapItem);
	const mapLocX = coords.x - DET.getRowClassPixelWidth(mapItem);

	const clickRow = Math.floor(mapItem.currentRow + (mapLocY/colElementSize)*SEL.getSamplingRatio('row'));
	const clickCol = Math.floor(mapItem.currentCol + (mapLocX/rowElementSize)*SEL.getSamplingRatio('col'));
	const destRow = clickRow + 1 - Math.floor(SEL.getCurrentDetDataPerCol(mapItem)/2);
	const destCol = clickCol + 1 - Math.floor(SEL.getCurrentDetDataPerRow(mapItem)/2);
	
	// set up panning animation 
	const diffRow =  clickRow + 1 - Math.floor(SEL.getCurrentDetDataPerCol(mapItem)/2) - mapItem.currentRow;
	const diffCol =  clickCol + 1 - Math.floor(SEL.getCurrentDetDataPerRow(mapItem)/2) - mapItem.currentCol;
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
			mapItem.currentRow = clickRow + 1 - Math.floor(SEL.getCurrentDetDataPerCol(mapItem)/2 + (numSteps-steps)*rowStep);
			mapItem.currentCol = clickCol + 1 - Math.floor(SEL.getCurrentDetDataPerCol(mapItem)/2 + (numSteps-steps)*colStep);
			SEL.checkRow(mapItem);
			SEL.checkCol(mapItem);
			SEL.updateSelection(mapItem);
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
			SEL.checkRow(mapItem);
			SEL.checkCol(mapItem);
			SEL.updateSelection(mapItem);
		}
	}
}

/*********************************************************************************************
 * FUNCTION:  labelClick -  The purpose of this function is to handle a label click on a given
 * detail panel.
 *********************************************************************************************/
DEV.labelClick = function (e) {
	const mapItem = DMM.getMapItemFromChm(e.target.parentElement.parentElement);
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
	SEL.updateSelections();
	SUM.drawSelectionMarks();
	SUM.drawTopItems();
	SRCH.showSearchResults();
}

/*********************************************************************************************
 * FUNCTION:  labelDrag -  The purpose of this function is to handle a label drag on a given
 * detail panel.
 *********************************************************************************************/
DEV.labelDrag = function(e){
	const mapItem = DMM.getMapItemFromChm(e.target.parentElement.parentElement);
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
	SEL.updateSelections();
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

/************************************************************************************************
 * FUNCTION: flickChange - Responds to a change in the flick view control.  All of these actions 
 * depend upon the flick control being visible (i.e. active) There are 3 types of changes 
 * (1) User clicks on the toggle control. (2) User changes the value of one of the 2 dropdowns 
 * AND the toggle control is on that dropdown. (3) The user presses the one or two key, corresponding
 * to the 2 dropdowns, AND the current visible data layer is for the opposite dropdown. 
 * If any of the above cases are met, the currentDl is changed and the screen is redrawn.
 ***********************************************************************************************/ 
(function() {
    // Table of flick button images so that Widgetizer only adds one
    // data: URL for each to the widget.
    const toggleButtons = {
	flickUp: 'images/toggleUp.png',
	flickDown: 'images/toggleDown.png'
    };
    DEV.flickChange = function(fromList) {
	const mapItem = DMM.primaryMap;
	const flickBtn = document.getElementById("flick_btn");
	const flickDrop1 = document.getElementById("flick1");
	const flickDrop2 = document.getElementById("flick2");
	if (typeof fromList === 'undefined') {
		if (flickBtn.dataset.state === 'flickUp') {
			flickBtn.dataset.state = 'flickDown';
			mapItem.currentDl = flickDrop2.value;
		} else {
			flickBtn.dataset.state = 'flickUp';
			mapItem.currentDl = flickDrop1.value;
		}
		flickBtn.setAttribute('src', toggleButtons[flickBtn.dataset.state]);
	} else if (fromList === null) {
		if (flickBtn.dataset.state === 'flickUp') {
			flickBtn.dataset.state = 'flickUp';
			mapItem.currentDl = flickDrop1.value === "" ? 'dl1' : flickDrop1.value;
		} else {
			flickBtn.dataset.state = 'flickDown';
			mapItem.currentDl = flickDrop2.value === "" ? 'dl1' : flickDrop2.value;
		}
		flickBtn.setAttribute('src', toggleButtons[flickBtn.dataset.state]);
	} else {
		if ((fromList === "flick1") && (flickBtn.dataset.state === 'flickUp')) {
			mapItem.currentDl = document.getElementById(fromList).value;
		} else if ((fromList === "flick2") && (flickBtn.dataset.state === 'flickDown')) {
			mapItem.currentDl = document.getElementById(fromList).value;
		} else if ((fromList === "toggle1") && (flickBtn.dataset.state === 'flickDown')) {
			flickBtn.dataset.state = 'flickUp';
			flickBtn.setAttribute('src', toggleButtons[flickBtn.dataset.state]);
			mapItem.currentDl = flickDrop1.value;
		} else if ((fromList === "toggle2") && (flickBtn.dataset.state === 'flickUp')) {
			flickBtn.dataset.state = 'flickDown';
			flickBtn.setAttribute('src', toggleButtons[flickBtn.dataset.state]);
			mapItem.currentDl = flickDrop2.value;
		} else {
			return;
		}
	} 
	SEL.setCurrentDL (mapItem.currentDl);
	SEL.flickInit();
	SUM.buildSummaryTexture();
	DMM.DetailMaps.forEach(dm => {
		dm.currentDl = mapItem.currentDl;
	})
	DET.setDrawDetailsTimeout(DET.redrawSelectionTimeout,true);
	SEL.updateSelections(true);
    };
})();

/*********************************************************************************************
 * FUNCTION:  handleMouseOut - The purpose of this function is to handle the situation where 
 * the user clicks on and drags off the detail canvas without letting up the mouse button.  
 * In these cases, we cancel the mouse event that we are tracking, reset mouseDown, and 
 * reset the cursor to default.
 *********************************************************************************************/
DEV.handleMouseOut = function (e) {
	const mapItem = DMM.getMapItemFromCanvas(e.currentTarget);
	mapItem.canvas.style.cursor="default";
	DET.mouseDown = false;
	SUM.mouseEventActive = false;
}

/*********************************************************************************************
 * FUNCTION:  handleMouseMove - The purpose of this function is to handle a user drag event.  
 * The type of move (drag-move or drag-select is determined, based upon keys pressed and the 
 * appropriate function is called to perform the function.
 *********************************************************************************************/
DEV.handleMouseMove = function (e) {
	const mapItem = DMM.getMapItemFromCanvas(e.currentTarget);
    // Do not clear help if the mouse position did not change. Repeated firing of the mousemove event can happen on random 
    // machines in all browsers but FireFox. There are varying reasons for this so we check and exit if need be.
	const eX = e.touches ? e.touches[0].clientX : e.clientX;
	const eY = e.touches ? e.touches[0].clientY : e.clientY;
	if(mapItem.oldMousePos[0] != eX ||mapItem.oldMousePos[1] != eY) {
		mapItem.oldMousePos = [eX, eY];
	} 
	if (DET.mouseDown && SUM.mouseEventActive){
		clearTimeout(DET.eventTimer);
		//If mouse is down and shift key is pressed, perform a drag selection
		//Else perform a drag move
		if (e.shiftKey) {
	        //process select drag only if the mouse is down AND the cursor is on the heat map.
            if((DET.mouseDown) && (UTIL.isOnObject(e,"map"))) {
			    SRCH.clearSearch(e);
			    DEV.handleSelectDrag(e);
            }
	    }
	    else {
		DEV.handleMoveDrag(e);
	    }
	} 
 }

/*********************************************************************************************
 * FUNCTION:  handleMoveDrag - The purpose of this function is to handle a user "move drag" 
 * event.  This is when the user clicks and drags across the detail heat map viewport. When 
 * this happens, the current position of the heatmap viewport is changed and the detail heat 
 * map is redrawn 
 *********************************************************************************************/
DEV.handleMoveDrag = function (e) {
	const mapItem = DMM.getMapItemFromCanvas(e.currentTarget);
    if(!DET.mouseDown) return;
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
		if (!UTIL.isOnObject(e,"colClass")) {
			mapItem.currentRow = Math.round(mapItem.currentRow - (yDrag/colElementSize));
			mapItem.dragOffsetY = coords.y;
		}
		if (!UTIL.isOnObject(e,"rowClass")) {
			mapItem.currentCol = Math.round(mapItem.currentCol - (xDrag/rowElementSize));
			mapItem.dragOffsetX = coords.x;  //canvas X coordinate 
		}
	    SEL.checkRow(mapItem);
	    SEL.checkCol(mapItem);
	    SEL.updateSelection(mapItem);
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
	const mapItem = DMM.getMapItemFromCanvas(e.currentTarget);
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
        UTIL.redrawCanvases();
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
	return Math.floor(mapItem.currentRow + (mapLocY/colElementSize)*SEL.getSamplingRatio(mapItem.mode,'row'));
}

DEV.getColFromLayerX = function (mapItem,layerX) {
	const rowElementSize = mapItem.dataBoxWidth * mapItem.canvas.clientWidth/mapItem.canvas.width; // px/Glpoint
	const rowClassWidthPx = DET.getRowClassPixelWidth(mapItem);
	const mapLocX = layerX - rowClassWidthPx;
	return Math.floor(mapItem.currentCol + (mapLocX/rowElementSize)*SEL.getSamplingRatio(mapItem.mode,'col'));
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
		SEL.updateSelection(mapItem, false);
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
			if (current < DET.zoomBoxSizes.length - 1) {
				DET.setDetailDataHeight (mapItem,DET.zoomBoxSizes[current+1]);
			}
			SEL.updateSelection(mapItem, false);
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
			if (current < DET.zoomBoxSizes.length - 1) {
				DET.setDetailDataWidth(mapItem,DET.zoomBoxSizes[current+1]);
			}
			SEL.updateSelection(mapItem, false);
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
	const mapItem = DMM.getMapItemFromChm(chm);
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
		    (Math.floor((mapItem.dataViewHeight-DET.dataViewBorder)/DET.zoomBoxSizes[current-1]) <= heatMap.getNumRows(MMGR.DETAIL_LEVEL)) &&
		    (Math.floor((mapItem.dataViewWidth-DET.dataViewBorder)/DET.zoomBoxSizes[current-1]) <= heatMap.getNumColumns(MMGR.DETAIL_LEVEL))){
			DET.setDetailDataSize (mapItem,DET.zoomBoxSizes[current-1]);
			SEL.updateSelection(mapItem);
		} else {
			//If we can't zoom out anymore see if ribbon mode would show more of the map or , switch to full map view.
			if ((current > 0) && (heatMap.getNumRows(MMGR.DETAIL_LEVEL) <= heatMap.getNumColumns(MMGR.DETAIL_LEVEL)) ) {
				DEV.detailVRibbonButton(mapItem);
			} else if ((current > 0) && (heatMap.getNumRows(MMGR.DETAIL_LEVEL) > heatMap.getNumColumns(MMGR.DETAIL_LEVEL)) ) {
				DEV.detailHRibbonButton(mapItem);
			} else {
				DEV.detailFullMap(mapItem);
			}	
		}	
	} else if ((mapItem.mode == 'RIBBONH') || (mapItem.mode == 'RIBBONH_DETAIL')) {
		const current = DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight);
		if ((current > 0) &&
		    (Math.floor((mapItem.dataViewHeight-DET.dataViewBorder)/DET.zoomBoxSizes[current-1]) <= heatMap.getNumRows(MMGR.DETAIL_LEVEL))) {
			// Additional zoom out in ribbon mode.
			DET.setDetailDataHeight (mapItem,DET.zoomBoxSizes[current-1]);
			SEL.updateSelection(mapItem);
		} else {
			// Switch to full map view.
			DEV.detailFullMap(mapItem);
		}	
	} else if ((mapItem.mode == 'RIBBONV') || (mapItem.mode == 'RIBBONV_DETAIL')) {
		const current = DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth);
		if ((current > 0) &&
		    (Math.floor((mapItem.dataViewWidth-DET.dataViewBorder)/DET.zoomBoxSizes[current-1]) <= heatMap.getNumColumns(MMGR.DETAIL_LEVEL))){
			// Additional zoom out in ribbon mode.
			DET.setDetailDataWidth (mapItem,DET.zoomBoxSizes[current-1]);
			SEL.updateSelection(mapItem);
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
	let mapItem = (typeof target !== 'undefined') ? target : DMM.primaryMap;
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
	SEL.setMode(mapItem,'NORMAL');
	DET.setButtons(mapItem);
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
	    while ((Math.floor((mapItem.dataViewHeight-DET.dataViewBorder)/DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight)]) > heatMap.getNumRows(MMGR.DETAIL_LEVEL)) ||
	       (Math.floor((mapItem.dataViewWidth-DET.dataViewBorder)/DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth)]) > heatMap.getNumColumns(MMGR.DETAIL_LEVEL))) {
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
	
	SEL.checkRow(mapItem);
	SEL.checkCol(mapItem);
	mapItem.canvas.width =  (mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row"));
	mapItem.canvas.height = (mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column"));
	 
	DET.detInitGl(mapItem);
	DDR.clearDendroSelection();
	SEL.updateSelection(mapItem);
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
	if (DDR.subDendroView === 'column') {
	    DET.scaleViewHeight(mapItem);
	} else if (DDR.subDendroView === 'row') {
	    DET.scaleViewWidth(mapItem);
	} else {
	    SEL.setMode(mapItem, 'FULL_MAP');
	    DET.scaleViewHeight(mapItem);
	    DET.scaleViewWidth(mapItem);
	}

	//Canvas is adjusted to fit the number of rows/columns and matrix height/width of each element.
	mapItem.canvas.width =  (mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row"));
	mapItem.canvas.height = (mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column"));
	DET.detInitGl(mapItem);
	SEL.updateSelection(mapItem);
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
	SEL.setMode(mapItem,'RIBBONH');
	DET.setButtons(mapItem);

	if (!restoreInfo) {
	    if (previousMode=='FULL_MAP') {
		DET.setDetailDataHeight(mapItem, DET.zoomBoxSizes[0]);
	    }
	    // If normal (full) ribbon, set the width of the detail display to the size of the horizontal ribbon view
	    // and data size to 1.
	    if (mapItem.selectedStart == null || mapItem.selectedStart == 0) {
		mapItem.dataViewWidth = heatMap.getNumColumns(MMGR.RIBBON_HOR_LEVEL) + DET.dataViewBorder;
		let ddw = 1;
		while(2*mapItem.dataViewWidth < 500){ // make the width wider to prevent blurry/big dendros for smaller maps
			ddw *=2;
			mapItem.dataViewWidth = ddw*heatMap.getNumColumns(MMGR.RIBBON_HOR_LEVEL) + DET.dataViewBorder;
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
	    while (Math.floor((mapItem.dataViewHeight-DET.dataViewBorder)/DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight)]) > heatMap.getNumRows(MMGR.DETAIL_LEVEL)) {
		DET.setDetailDataHeight(mapItem,DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxHeight)+1]);
	    }
	}

	mapItem.canvas.width =  (mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row"));
	mapItem.canvas.height = (mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column"));
	DET.detInitGl(mapItem);
	SEL.updateSelection(mapItem);
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
	
	SEL.setMode(mapItem, 'RIBBONV');
	DET.setButtons(mapItem);

	// If normal (full) ribbon, set the width of the detail display to the size of the horizontal ribbon view
	// and data size to 1.
	if (mapItem.selectedStart == null || mapItem.selectedStart == 0) {
		mapItem.dataViewHeight = heatMap.getNumRows(MMGR.RIBBON_VERT_LEVEL) + DET.dataViewBorder;
		let ddh = 1;
		while(2*mapItem.dataViewHeight < 500){ // make the height taller to prevent blurry/big dendros for smaller maps
			ddh *=2;
			mapItem.dataViewHeight = ddh*heatMap.getNumRows(MMGR.RIBBON_VERT_LEVEL) + DET.dataViewBorder;
		}
		DET.setDetailDataHeight(mapItem,ddh);
		mapItem.currentRow = 1;
	} else {
		mapItem.saveRow = mapItem.selectedStart;
		let selectionSize = mapItem.selectedStop - mapItem.selectedStart + 1;
		if (selectionSize < 500) {
			DEV.clearModeHistory (mapItem);
			SEL.setMode(mapItem, 'RIBBONV_DETAIL');
		} else {
			const rvRate = heatMap.getRowSummaryRatio(MMGR.RIBBON_VERT_LEVEL);
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
	    while (Math.floor((mapItem.dataViewWidth-DET.dataViewBorder)/DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth)]) > heatMap.getNumColumns(MMGR.DETAIL_LEVEL)) {
		DET.setDetailDataWidth(mapItem,DET.zoomBoxSizes[DET.zoomBoxSizes.indexOf(mapItem.dataBoxWidth)+1]);
	    }
	}

	mapItem.canvas.width =  (mapItem.dataViewWidth + DET.calculateTotalClassBarHeight("row"));
	mapItem.canvas.height = (mapItem.dataViewHeight + DET.calculateTotalClassBarHeight("column"));
	DET.detInitGl(mapItem);
	SEL.updateSelection(mapItem);
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
	const mapItem = DMM.getMapItemFromChm(chm);
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
				const rightRatio=Math.max(0,(SEL.getCurrentDetDataPerRow(mapItem)*heatMap.getColSummaryRatio("d")-saveCol-1-detNum)*mapWRatio /SEL.getCurrentDetDataPerRow(mapItem) /animateCountMax/heatMap.getColSummaryRatio("d")); // this one works for maps that are not too big!!
				const topRatio = (saveRow-1)*mapHRatio /mapItem.dataPerCol /animateCountMax/heatMap.getRowSummaryRatio("d");
				const bottomRatio = Math.max(0,(SEL.getCurrentDetDataPerCol(mapItem)*heatMap.getRowSummaryRatio("d")-saveRow-1-detNum)*mapHRatio   /SEL.getCurrentDetDataPerCol(mapItem) /animateCountMax/heatMap.getRowSummaryRatio("d")); // this one works for maps that are not too big!
				
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

document.getElementById('flick_btn').onclick = function (event) {
    DEV.flickChange();
};
document.getElementById('flick1').onchange = function (event) {
    DEV.flickChange('flick1');
};
document.getElementById('flick2').onchange = function (event) {
    DEV.flickChange('flick2');
};
document.getElementById('flickOn_pic').onclick = function (event) {
    SEL.flickToggleOff();
};

})();
