export function bindRouteEvents({ navigate }) {
  document.querySelectorAll('[data-route]').forEach((element) => {
    element.addEventListener('click', () => {
      const route = element.dataset.route;
      if (route) {
        navigate(route);
      }
    });
  });
}
