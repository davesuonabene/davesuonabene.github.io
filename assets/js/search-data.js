// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-home",
    title: "home",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-gaia",
          title: "GAIA",
          description: "a world of projects",
          section: "Navigation",
          handler: () => {
            window.location.href = "/gaia/";
          },
        },{id: "nav-blog",
          title: "blog",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/blog/";
          },
        },{id: "projects-deq-eight",
          title: 'dEQ Eight',
          description: "The EQ Eight you know and love — now fully dynamic.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/dEQ/";
            },},{
        id: 'social-rss',
        title: 'RSS Feed',
        section: 'Socials',
        handler: () => {
          window.open("/feed.xml", "_blank");
        },
      },];
