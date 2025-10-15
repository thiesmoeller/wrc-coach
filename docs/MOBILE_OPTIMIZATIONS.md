# Mobile Layout Optimizations for WRC Coach

## Changes Made for Coxswain Visibility and Mobile UX

### 1. ✅ Compact Legends
**Problem**: Legends took up too much space on small screens
**Solution**: 
- Reduced legend text: "Drive Phase" → "Drive", "Recovery Phase" → "Recovery"
- Removed redundant helper text on mobile
- Added `.compact` class with smaller font size (0.6rem on mobile)
- Reduced gaps between legend items

### 2. ✅ Thicker Lines for Distance Visibility
**Problem**: Coxswain needs to see the plots from a distance
**Solution**:
- **Polar plot current stroke**: 3px → 4px
- **Polar plot historical strokes**: 2.5px → 3.5px  
- **Stability plot**: 3px → 4px
- Lines now visible from typical coxswain viewing distance (~2-3 meters)

### 3. ✅ Continuous Stability Plot
**Problem**: Start and end of stroke cycle didn't connect (gap between 360° and 0°)
**Solution**:
- Duplicate catch samples (0°) at 360° to close the loop
- Sort samples by angle to maintain proper order
- Detect discontinuities (>100° jumps) and handle appropriately
- Roll trace now seamlessly wraps from end of stroke back to beginning

### 4. ✅ Mobile Layout Optimization
**Changes**:
- Reduced main content padding: 0.5rem → 0.4rem
- Reduced chart container padding: 0.75rem → 0.6rem
- Reduced chart margins: 0.5rem → 0.4rem
- Reduced chart titles: 1rem → 0.85rem
- Optimized canvas heights:
  - Polar: 300px → 280px (still sufficient)
  - Stability: 100px → 90px (reduced max to 140px)

### 5. ✅ Header Optimization
- Logo scales down on mobile (32px → 28px)
- Title font size optimized (1.5rem → 1.1rem on mobile)
- Better space usage for status indicator

## Visual Improvements Summary

| Element | Desktop | Mobile | Change |
|---------|---------|--------|--------|
| Polar line width | 4px | 4px | +33% |
| History line width | 3.5px | 3.5px | +40% |
| Stability line width | 4px | 4px | +33% |
| Legend font | 0.7rem | 0.6rem | Compact |
| Chart padding | 0.75rem | 0.6rem | -20% |
| Canvas height (polar) | 350-500px | 280px | Optimized |
| Canvas height (stability) | 120-180px | 90-140px | Optimized |

## Benefits

1. **Better Visibility**: Thicker lines visible from coxswain seat
2. **More Screen Space**: Compact legends and optimized padding
3. **Continuous Data**: Stability plot wraps seamlessly
4. **Professional Look**: Cleaner, more focused interface
5. **Better UX**: More data visible without scrolling on mobile

## Testing Recommendations

- Test on actual phone from 2-3 meters distance (typical coxswain position)
- Verify in bright sunlight conditions
- Check both landscape and portrait orientations
- Test with demo mode to verify continuous stability trace

