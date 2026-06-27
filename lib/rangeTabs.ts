export const RANGE_TAB_RADIUS = {
  container: "rounded-full",
  selected: "",
  selectedRight: "",
  left: "rounded-l-md rounded-r-md",
  middle: "rounded-md",
  right: "rounded-l-md rounded-r-full",
};

export const SELECTED_RANGE_TAB_INNER_RADIUS = 150;
export const RANGE_TAB_BUTTON_WIDTH = 40;
export const RANGE_TAB_BUTTON_HEIGHT = 25;
export const RANGE_TAB_CONTAINER_HEIGHT = RANGE_TAB_BUTTON_HEIGHT + 6;
const SELECTED_RANGE_TAB_RADIUS_SCALE = 32;

export function getRangeTabRadius(index: number, total: number, selected: boolean) {
  if (selected && index === total - 1) return RANGE_TAB_RADIUS.selectedRight;
  if (selected) return RANGE_TAB_RADIUS.selected;
  if (index === 0) return RANGE_TAB_RADIUS.left;
  if (index === total - 1) return RANGE_TAB_RADIUS.right;
  return RANGE_TAB_RADIUS.middle;
}

export function getRangeTabStyle(index: number, total: number, selected: boolean) {
  if (!selected) return undefined;

  const inner = SELECTED_RANGE_TAB_INNER_RADIUS / SELECTED_RANGE_TAB_RADIUS_SCALE;
  const outer = RANGE_TAB_BUTTON_HEIGHT / 2;

  if (index > 0 && index < total - 1) {
    return {
      borderTopLeftRadius: `${inner}px`,
      borderTopRightRadius: `${inner}px`,
      borderBottomRightRadius: `${inner}px`,
      borderBottomLeftRadius: `${inner}px`,
    };
  }

  const topLeft = index === 0 ? outer : inner;
  const topRight = index === total - 1 ? outer : inner;
  const bottomRight = index === total - 1 ? outer : inner;
  const bottomLeft = index === 0 ? outer : inner;

  return {
    borderTopLeftRadius: `${topLeft}px`,
    borderTopRightRadius: `${topRight}px`,
    borderBottomRightRadius: `${bottomRight}px`,
    borderBottomLeftRadius: `${bottomLeft}px`,
  };
}

export function getRangeTabButtonStyle() {
  return {
    width: `${RANGE_TAB_BUTTON_WIDTH}px`,
    height: `${RANGE_TAB_BUTTON_HEIGHT}px`,
  };
}
