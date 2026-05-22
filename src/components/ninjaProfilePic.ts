import {
  CONTAINER_CLASS,
  ENTER_DURATION_PROP,
  LINE_POS_HIDDEN,
  LINE_POS_PROP,
  LINE_POS_REVEALED,
  MASK_ANGLE_PROP,
  NINJA_IMAGE_CLASS,
  STATE_ENTERING,
  STATE_LEAVING,
  STATE_TRACKING,
} from './ninjaProfilePic.constants.ts';

const enterMs = parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue(ENTER_DURATION_PROP)
);

document.querySelectorAll<HTMLElement>(`.${CONTAINER_CLASS}`).forEach((container) => {
  const ninja = container.querySelector<HTMLElement>(`.${NINJA_IMAGE_CLASS}`)!;
  let enterToken = 0;

  function getAngle(clientX: number, clientY: number): number {
    const r = container.getBoundingClientRect();
    return Math.atan2(
      clientY - (r.top + r.height / 2),
      clientX - (r.left + r.width / 2),
    ) * (180 / Math.PI);
  }

  function enter(clientX: number, clientY: number): void {
    const token = ++enterToken;
    ninja.style.setProperty(MASK_ANGLE_PROP, `${getAngle(clientX, clientY)}deg`);
    ninja.classList.remove(STATE_LEAVING, STATE_TRACKING);
    void ninja.offsetWidth;
    ninja.classList.add(STATE_ENTERING);
    ninja.style.setProperty(LINE_POS_PROP, LINE_POS_REVEALED);

    setTimeout(() => {
      if (enterToken !== token) return;
      ninja.classList.remove(STATE_ENTERING);
      ninja.classList.add(STATE_TRACKING);
    }, enterMs);
  }

  function move(clientX: number, clientY: number): void {
    ninja.style.setProperty(MASK_ANGLE_PROP, `${getAngle(clientX, clientY)}deg`);
  }

  function leave(clientX: number, clientY: number): void {
    ++enterToken;
    ninja.style.setProperty(MASK_ANGLE_PROP, `${getAngle(clientX, clientY)}deg`);
    ninja.classList.remove(STATE_ENTERING, STATE_TRACKING);
    void ninja.offsetWidth;
    ninja.classList.add(STATE_LEAVING);
    ninja.style.setProperty(LINE_POS_PROP, LINE_POS_HIDDEN);
  }

  container.addEventListener('mouseenter', (e: MouseEvent) => enter(e.clientX, e.clientY));
  container.addEventListener('mousemove',  (e: MouseEvent) => move(e.clientX, e.clientY));
  container.addEventListener('mouseleave', (e: MouseEvent) => leave(e.clientX, e.clientY));

  container.addEventListener('touchstart', (e: TouchEvent) => {
    const t = e.touches[0];
    enter(t.clientX, t.clientY);
  }, { passive: true });

  container.addEventListener('touchmove', (e: TouchEvent) => {
    e.preventDefault();
    const t = e.touches[0];
    move(t.clientX, t.clientY);
  }, { passive: false });

  container.addEventListener('touchend', (e: TouchEvent) => {
    const t = e.changedTouches[0];
    leave(t.clientX, t.clientY);
  });

  container.addEventListener('touchcancel', (e: TouchEvent) => {
    const t = e.changedTouches[0];
    leave(t.clientX, t.clientY);
  });
});
