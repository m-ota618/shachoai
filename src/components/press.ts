export function press(el: HTMLElement) {
  el.animate(
    [
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(1px) scale(.98)' },
      { transform: 'translateY(0) scale(1)' },
    ],
    { duration: 140, easing: 'cubic-bezier(.2,.8,.2,1)' }
  );
}
