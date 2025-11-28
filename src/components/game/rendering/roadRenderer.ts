import { TILE_WIDTH, TILE_HEIGHT } from '@/components/game/types';

/**
 * Draws a road tile with proper adjacency, markings, and sidewalks
 */
export function drawRoad(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  gridX: number,
  gridY: number,
  hasRoad: (gridX: number, gridY: number) => boolean
) {
  const w = TILE_WIDTH;
  const h = TILE_HEIGHT;
  const cx = x + w / 2;
  const cy = y + h / 2;
  
  // Check adjacency (in isometric coordinates)
  const north = hasRoad(gridX - 1, gridY);  // top-left edge
  const east = hasRoad(gridX, gridY - 1);   // top-right edge
  const south = hasRoad(gridX + 1, gridY);  // bottom-right edge
  const west = hasRoad(gridX, gridY + 1);   // bottom-left edge
  
  // Road width - aligned with gridlines
  const roadW = w * 0.14;
  const roadH = h * 0.14;
  
  // Sidewalk configuration
  const sidewalkWidth = w * 0.08; // Width of the sidewalk strip
  const sidewalkColor = '#9ca3af'; // Light gray for sidewalk
  const curbColor = '#6b7280'; // Darker gray for curb edge
  
  // Edge stop distance - extend roads almost to the edge for better connection
  // Using 0.98 means roads extend to 98% of the way to the edge
  const edgeStop = 0.98;
  
  // Calculate edge midpoints (where gridlines meet)
  const northEdgeX = x + w * 0.25;
  const northEdgeY = y + h * 0.25;
  const eastEdgeX = x + w * 0.75;
  const eastEdgeY = y + h * 0.25;
  const southEdgeX = x + w * 0.75;
  const southEdgeY = y + h * 0.75;
  const westEdgeX = x + w * 0.25;
  const westEdgeY = y + h * 0.75;
  
  // Calculate direction vectors for each edge (normalized)
  // These align with the gridline directions
  const northDx = (northEdgeX - cx) / Math.hypot(northEdgeX - cx, northEdgeY - cy);
  const northDy = (northEdgeY - cy) / Math.hypot(northEdgeX - cx, northEdgeY - cy);
  const eastDx = (eastEdgeX - cx) / Math.hypot(eastEdgeX - cx, eastEdgeY - cy);
  const eastDy = (eastEdgeY - cy) / Math.hypot(eastEdgeX - cx, eastEdgeY - cy);
  const southDx = (southEdgeX - cx) / Math.hypot(southEdgeX - cx, southEdgeY - cy);
  const southDy = (southEdgeY - cy) / Math.hypot(southEdgeX - cx, southEdgeY - cy);
  const westDx = (westEdgeX - cx) / Math.hypot(westEdgeX - cx, westEdgeY - cy);
  const westDy = (westEdgeY - cy) / Math.hypot(westEdgeX - cx, westEdgeY - cy);
  
  // Perpendicular vectors for road width (rotated 90 degrees)
  const getPerp = (dx: number, dy: number) => ({ nx: -dy, ny: dx });
  
  // ============================================
  // DRAW SIDEWALKS FIRST (underneath the road)
  // ============================================
  // Sidewalks appear on edges where there's NO adjacent road
  // They run along the outer perimeter of the tile edge
  
  // Diamond corner points
  const topCorner = { x: x + w / 2, y: y };
  const rightCorner = { x: x + w, y: y + h / 2 };
  const bottomCorner = { x: x + w / 2, y: y + h };
  const leftCorner = { x: x, y: y + h / 2 };
  
  // Draw sidewalk helper - draws a strip along an edge, optionally shortening at corners
  const drawSidewalkEdge = (
    startX: number, startY: number, 
    endX: number, endY: number,
    inwardDx: number, inwardDy: number,
    shortenStart: boolean = false,
    shortenEnd: boolean = false
  ) => {
    const swWidth = sidewalkWidth;
    const shortenDist = swWidth * 0.707; // Distance to shorten at corners
    
    // Calculate edge direction vector
    const edgeDx = endX - startX;
    const edgeDy = endY - startY;
    const edgeLen = Math.hypot(edgeDx, edgeDy);
    const edgeDirX = edgeDx / edgeLen;
    const edgeDirY = edgeDy / edgeLen;
    
    // Apply shortening if needed
    let actualStartX = startX;
    let actualStartY = startY;
    let actualEndX = endX;
    let actualEndY = endY;
    
    if (shortenStart && edgeLen > shortenDist * 2) {
      actualStartX = startX + edgeDirX * shortenDist;
      actualStartY = startY + edgeDirY * shortenDist;
    }
    if (shortenEnd && edgeLen > shortenDist * 2) {
      actualEndX = endX - edgeDirX * shortenDist;
      actualEndY = endY - edgeDirY * shortenDist;
    }
    
    // Draw curb (darker line at outer edge)
    ctx.strokeStyle = curbColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(actualStartX, actualStartY);
    ctx.lineTo(actualEndX, actualEndY);
    ctx.stroke();
    
    // Draw sidewalk fill
    ctx.fillStyle = sidewalkColor;
    ctx.beginPath();
    ctx.moveTo(actualStartX, actualStartY);
    ctx.lineTo(actualEndX, actualEndY);
    ctx.lineTo(actualEndX + inwardDx * swWidth, actualEndY + inwardDy * swWidth);
    ctx.lineTo(actualStartX + inwardDx * swWidth, actualStartY + inwardDy * swWidth);
    ctx.closePath();
    ctx.fill();
  };
  
  // North edge sidewalk (top-left edge: leftCorner to topCorner)
  // Inward direction points toward center-right and down
  if (!north) {
    const inwardDx = 0.707; // ~45 degrees inward
    const inwardDy = 0.707;
    // Shorten at topCorner if east edge also has sidewalk
    const shortenAtTop = !east;
    // Shorten at leftCorner if west edge also has sidewalk
    const shortenAtLeft = !west;
    drawSidewalkEdge(leftCorner.x, leftCorner.y, topCorner.x, topCorner.y, inwardDx, inwardDy, shortenAtLeft, shortenAtTop);
  }
  
  // East edge sidewalk (top-right edge: topCorner to rightCorner)
  // Inward direction points toward center-left and down
  if (!east) {
    const inwardDx = -0.707;
    const inwardDy = 0.707;
    // Shorten at topCorner if north edge also has sidewalk
    const shortenAtTop = !north;
    // Shorten at rightCorner if south edge also has sidewalk
    const shortenAtRight = !south;
    drawSidewalkEdge(topCorner.x, topCorner.y, rightCorner.x, rightCorner.y, inwardDx, inwardDy, shortenAtTop, shortenAtRight);
  }
  
  // South edge sidewalk (bottom-right edge: rightCorner to bottomCorner)
  // Inward direction points toward center-left and up
  if (!south) {
    const inwardDx = -0.707;
    const inwardDy = -0.707;
    // Shorten at rightCorner if east edge also has sidewalk
    const shortenAtRight = !east;
    // Shorten at bottomCorner if west edge also has sidewalk
    const shortenAtBottom = !west;
    drawSidewalkEdge(rightCorner.x, rightCorner.y, bottomCorner.x, bottomCorner.y, inwardDx, inwardDy, shortenAtRight, shortenAtBottom);
  }
  
  // West edge sidewalk (bottom-left edge: bottomCorner to leftCorner)
  // Inward direction points toward center-right and up
  if (!west) {
    const inwardDx = 0.707;
    const inwardDy = -0.707;
    // Shorten at bottomCorner if south edge also has sidewalk
    const shortenAtBottom = !south;
    // Shorten at leftCorner if north edge also has sidewalk
    const shortenAtLeft = !north;
    drawSidewalkEdge(bottomCorner.x, bottomCorner.y, leftCorner.x, leftCorner.y, inwardDx, inwardDy, shortenAtBottom, shortenAtLeft);
  }
  
  // Draw corner sidewalk pieces for non-adjacent edges that meet
  // Corner pieces connect exactly where the shortened edge strips end
  const swWidth = sidewalkWidth;
  const shortenDist = swWidth * 0.707;
  ctx.fillStyle = sidewalkColor;
  
  // Helper to calculate where a shortened edge's inner endpoint is
  const getShortenedInnerEndpoint = (
    cornerX: number, cornerY: number,
    otherCornerX: number, otherCornerY: number,
    inwardDx: number, inwardDy: number
  ) => {
    // Edge direction FROM otherCorner TO corner (the direction the edge approaches the corner)
    const edgeDx = cornerX - otherCornerX;
    const edgeDy = cornerY - otherCornerY;
    const edgeLen = Math.hypot(edgeDx, edgeDy);
    const edgeDirX = edgeDx / edgeLen;
    const edgeDirY = edgeDy / edgeLen;
    // Shortened outer endpoint (move backwards from corner along edge)
    const shortenedOuterX = cornerX - edgeDirX * shortenDist;
    const shortenedOuterY = cornerY - edgeDirY * shortenDist;
    // Inner endpoint
    return {
      x: shortenedOuterX + inwardDx * swWidth,
      y: shortenedOuterY + inwardDy * swWidth
    };
  };
  
  // Top corner (where north and east edges meet) - only if both don't have roads
  if (!north && !east) {
    const northInner = getShortenedInnerEndpoint(
      topCorner.x, topCorner.y, leftCorner.x, leftCorner.y,
      0.707, 0.707
    );
    const eastInner = getShortenedInnerEndpoint(
      topCorner.x, topCorner.y, rightCorner.x, rightCorner.y,
      -0.707, 0.707
    );
    ctx.beginPath();
    ctx.moveTo(topCorner.x, topCorner.y);
    ctx.lineTo(northInner.x, northInner.y);
    ctx.lineTo(eastInner.x, eastInner.y);
    ctx.closePath();
    ctx.fill();
  }
  
  // Right corner (where east and south edges meet)
  if (!east && !south) {
    const eastInner = getShortenedInnerEndpoint(
      rightCorner.x, rightCorner.y, topCorner.x, topCorner.y,
      -0.707, 0.707
    );
    const southInner = getShortenedInnerEndpoint(
      rightCorner.x, rightCorner.y, bottomCorner.x, bottomCorner.y,
      -0.707, -0.707
    );
    ctx.beginPath();
    ctx.moveTo(rightCorner.x, rightCorner.y);
    ctx.lineTo(eastInner.x, eastInner.y);
    ctx.lineTo(southInner.x, southInner.y);
    ctx.closePath();
    ctx.fill();
  }
  
  // Bottom corner (where south and west edges meet)
  if (!south && !west) {
    const southInner = getShortenedInnerEndpoint(
      bottomCorner.x, bottomCorner.y, rightCorner.x, rightCorner.y,
      -0.707, -0.707
    );
    const westInner = getShortenedInnerEndpoint(
      bottomCorner.x, bottomCorner.y, leftCorner.x, leftCorner.y,
      0.707, -0.707
    );
    ctx.beginPath();
    ctx.moveTo(bottomCorner.x, bottomCorner.y);
    ctx.lineTo(southInner.x, southInner.y);
    ctx.lineTo(westInner.x, westInner.y);
    ctx.closePath();
    ctx.fill();
  }
  
  // Left corner (where west and north edges meet)
  if (!west && !north) {
    const westInner = getShortenedInnerEndpoint(
      leftCorner.x, leftCorner.y, bottomCorner.x, bottomCorner.y,
      0.707, -0.707
    );
    const northInner = getShortenedInnerEndpoint(
      leftCorner.x, leftCorner.y, topCorner.x, topCorner.y,
      0.707, 0.707
    );
    ctx.beginPath();
    ctx.moveTo(leftCorner.x, leftCorner.y);
    ctx.lineTo(westInner.x, westInner.y);
    ctx.lineTo(northInner.x, northInner.y);
    ctx.closePath();
    ctx.fill();
  }
  
  // ============================================
  // DRAW ROAD SEGMENTS
  // ============================================
  ctx.fillStyle = '#4a4a4a';
  
  // North segment (to top-left) - aligned with gridline
  if (north) {
    const stopX = cx + (northEdgeX - cx) * edgeStop;
    const stopY = cy + (northEdgeY - cy) * edgeStop;
    const perp = getPerp(northDx, northDy);
    const halfWidth = roadW * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + perp.nx * halfWidth, cy + perp.ny * halfWidth);
    ctx.lineTo(stopX + perp.nx * halfWidth, stopY + perp.ny * halfWidth);
    ctx.lineTo(stopX - perp.nx * halfWidth, stopY - perp.ny * halfWidth);
    ctx.lineTo(cx - perp.nx * halfWidth, cy - perp.ny * halfWidth);
    ctx.closePath();
    ctx.fill();
  }
  
  // East segment (to top-right) - aligned with gridline
  if (east) {
    const stopX = cx + (eastEdgeX - cx) * edgeStop;
    const stopY = cy + (eastEdgeY - cy) * edgeStop;
    const perp = getPerp(eastDx, eastDy);
    const halfWidth = roadW * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + perp.nx * halfWidth, cy + perp.ny * halfWidth);
    ctx.lineTo(stopX + perp.nx * halfWidth, stopY + perp.ny * halfWidth);
    ctx.lineTo(stopX - perp.nx * halfWidth, stopY - perp.ny * halfWidth);
    ctx.lineTo(cx - perp.nx * halfWidth, cy - perp.ny * halfWidth);
    ctx.closePath();
    ctx.fill();
  }
  
  // South segment (to bottom-right) - aligned with gridline
  if (south) {
    const stopX = cx + (southEdgeX - cx) * edgeStop;
    const stopY = cy + (southEdgeY - cy) * edgeStop;
    const perp = getPerp(southDx, southDy);
    const halfWidth = roadW * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + perp.nx * halfWidth, cy + perp.ny * halfWidth);
    ctx.lineTo(stopX + perp.nx * halfWidth, stopY + perp.ny * halfWidth);
    ctx.lineTo(stopX - perp.nx * halfWidth, stopY - perp.ny * halfWidth);
    ctx.lineTo(cx - perp.nx * halfWidth, cy - perp.ny * halfWidth);
    ctx.closePath();
    ctx.fill();
  }
  
  // West segment (to bottom-left) - aligned with gridline
  if (west) {
    const stopX = cx + (westEdgeX - cx) * edgeStop;
    const stopY = cy + (westEdgeY - cy) * edgeStop;
    const perp = getPerp(westDx, westDy);
    const halfWidth = roadW * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + perp.nx * halfWidth, cy + perp.ny * halfWidth);
    ctx.lineTo(stopX + perp.nx * halfWidth, stopY + perp.ny * halfWidth);
    ctx.lineTo(stopX - perp.nx * halfWidth, stopY - perp.ny * halfWidth);
    ctx.lineTo(cx - perp.nx * halfWidth, cy - perp.ny * halfWidth);
    ctx.closePath();
    ctx.fill();
  }
  
  // Center intersection (always drawn)
  const centerSize = roadW * 1.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy - centerSize);
  ctx.lineTo(cx + centerSize, cy);
  ctx.lineTo(cx, cy + centerSize);
  ctx.lineTo(cx - centerSize, cy);
  ctx.closePath();
  ctx.fill();
  
  // Draw road markings (yellow dashed lines) - aligned with gridlines
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 0.8;  // Thinner lines
  ctx.setLineDash([1.5, 2]);  // Smaller, more frequent dots
  ctx.lineCap = 'round';
  
  // Extend past tile edge to overlap with adjacent tile's marking
  // This ensures continuous yellow lines across tile boundaries
  const markingOverlap = 4; // pixels past edge for overlap
  const markingStartOffset = 2; // pixels from center
  
  // North marking (toward top-left)
  if (north) {
    ctx.beginPath();
    ctx.moveTo(cx + northDx * markingStartOffset, cy + northDy * markingStartOffset);
    ctx.lineTo(northEdgeX + northDx * markingOverlap, northEdgeY + northDy * markingOverlap);
    ctx.stroke();
  }
  
  // East marking (toward top-right)
  if (east) {
    ctx.beginPath();
    ctx.moveTo(cx + eastDx * markingStartOffset, cy + eastDy * markingStartOffset);
    ctx.lineTo(eastEdgeX + eastDx * markingOverlap, eastEdgeY + eastDy * markingOverlap);
    ctx.stroke();
  }
  
  // South marking (toward bottom-right)
  if (south) {
    ctx.beginPath();
    ctx.moveTo(cx + southDx * markingStartOffset, cy + southDy * markingStartOffset);
    ctx.lineTo(southEdgeX + southDx * markingOverlap, southEdgeY + southDy * markingOverlap);
    ctx.stroke();
  }
  
  // West marking (toward bottom-left)
  if (west) {
    ctx.beginPath();
    ctx.moveTo(cx + westDx * markingStartOffset, cy + westDy * markingStartOffset);
    ctx.lineTo(westEdgeX + westDx * markingOverlap, westEdgeY + westDy * markingOverlap);
    ctx.stroke();
  }
  
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
}
