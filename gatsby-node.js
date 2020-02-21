const uuidv4 = require('uuid/v4');
const path = require('path');
const slash = require('slash');
const HeaderJson = require('./src/components/Header/Header.data.json');
const FooterJson = require('./src/components/Footer/Footer.data.json');

// const { fetchAllItems } = require('./src/helpers/fetchAllItems');
// Can't import this correctly from a helper folder because of build time issues?
// Defining this funciton in this file for now.


exports.sourceNodes = async ({
  actions,
  createNodeId,
  createContentDigest,
}) => {
  const prepareNode = (obj, name) => {
    const data = {
      key: uuidv4(),
      value: JSON.stringify(obj),
    };
    const node = JSON.stringify(data);
    const nodeMeta = {
      id: createNodeId(`my-data-${data.key}`),
      parent: null,
      children: [],
      internal: {
        type: name,
        mediaType: 'text/json',
        content: node,
        contentDigest: createContentDigest(data),
      },
    };

    const output = { ...data, ...nodeMeta };
    return output;
  };

  const { createNode } = actions;

  createNode(prepareNode(HeaderJson, 'headerLinks'));
  createNode(prepareNode(FooterJson, 'FooterLinks'));
};


exports.createPages = async ({ graphql, actions }) => {
  const { createPage } = actions; // The “graphql” function allows us to run arbitrary queries against the local Gatsby GraphQL schema. Think of it like the site has a built-in database constructed from the fetched data that you can run queries against

  // ////////////////////
  // Creating Blog Post pages
  // ////////////////////
  const postTemplate = path.resolve('./src/templates/post.jsx');

  const postsResults = await graphql(`
  {
    wpgraphql {
      posts(first: 1000) {
        edges {
          node {
            slug
            id
          }
          cursor
        }
        pageInfo {
          endCursor
          startCursor
          hasNextPage
          hasPreviousPage
        }
      }
    }
  }
  `);

  if (postsResults.errors) {
    console.error(postsResults.errors);
  }

  const PostsIndex = path.resolve('./src/templates/PostsIndex.jsx');
  const posts = postsResults.data.wpgraphql.posts.edges;
  const postsPageInfo = postsResults.data.wpgraphql.posts.pageInfo;

  const allPostsArray = await fetchAllItems(postsPageInfo, posts, 'posts', 'id slug');

  const postsPerPage = 10;
  let pageNum = 1;
  const totalPages = Math.floor((allPostsArray.length / postsPerPage));

  // We want to create a detailed page for each post node. We'll just use the WordPress Slug for the slug. The Post ID is prefixed with 'POST_'
  allPostsArray.map((edge) => {
    // Each page is required to have a `path` as well as a template component. The `context` is optional but is often necessary so the template can query data specific to each page.
    createPage({
      path: `/${edge.node.slug}/`,
      component: slash(postTemplate),
      context: {
        id: edge.node.id,
      },
    });
  });

  // /////////////////////
  // Pagination for blog index
  // ////////////////////
  for (let i = 0; i < allPostsArray.length; i += postsPerPage) {
    createPage({
      path: `page/${pageNum}`,
      component: slash(PostsIndex),
      context: {
        startCursor: allPostsArray[i].cursor,
        pageNum,
        totalPages,
      },
    });
    pageNum += 1;
  }

  // ////////////////////
  // Creating TAGS pages
  // ////////////////////

  const tagsResults = path.resolve('./src/templates/tagResults.jsx');
  // We have more than 100 tags.. We need to make multiple graphQL calls, 100 tags at a time, to get them all.
  // We make our initial call to get the first 100 tags
  const getTagsResults = await graphql(`
  {
    wpgraphql {
      tags(first: 100) {
        edges {
          node {
            id
            name
            slug
            posts {
              edges {
                node {
                  id
                }
                cursor
              }
            }
          }
          cursor
        }
        pageInfo {
          endCursor
          startCursor
          hasNextPage
          hasPreviousPage
        }
      }
    }
  }`);
  const tags = getTagsResults.data.wpgraphql.tags.edges;
  const tagsPageInfo = getTagsResults.data.wpgraphql.tags.pageInfo;


  const allTagsArray = await fetchAllItems(tagsPageInfo, tags, 'tags', 'id name slug posts(first: 100) { edges { node { title id } cursor } }');

  const TagsIndex = path.resolve('./src/templates/TagsIndex.jsx');
  const tagsPostsPerPage = 10;
  let tagsPageNum = 1;
  // const totalTagsPages = Math.floor((allTagsArray.length / tagsPostsPerPage));
  // We make a page for each tag
  // But we need to paginate each tag's posts based on how many posts each tag has.
  allTagsArray.map((tag) => {
    const totalTagsPages = Math.ceil((tag.node.posts.edges.length / tagsPostsPerPage));
    // Loop through each tag
    // Check it's posts array.  Does it have any posts associated with it?  Some tags have 0 posts, if so skip this
    if (tag.node.posts.edges.length !== 0) {
      // If more than 10, create additional tag pages and paginate the posts.
      // Set the first cursor to empty string, so graphql QL query includes that item. first: 10, after: 'cursor' excludes that first item
      //  further queries will grab the 10th items cursor, meaning it'll start with the 11th on the page.
      tag.node.posts.edges[0].cursor = '';
      if (tag.node.posts.edges.length <= tagsPostsPerPage) {
        createPage({
          path: `tags/${tag.node.slug}/page/${tagsPageNum}`,
          component: slash(TagsIndex),
          context: {
            id: tag.node.id,
            startCursor: tag.node.posts.edges[0].cursor,
            tagsPageNum,
            totalTagsPages,
          },
        });
      } else {
        for (let i = 0; i < tag.node.posts.edges.length; i += tagsPostsPerPage) {
          createPage({
            path: `tags/${tag.node.slug}/page/${tagsPageNum}`,
            component: slash(TagsIndex),
            context: {
              id: tag.node.id,
              startCursor: tag.node.posts.edges[i].cursor,
              tagsPageNum,
              totalTagsPages,
            },
          });
          tagsPageNum += 1;
        }
      }
    }
  });

  // ////////////////////
  // Creating Categories pages
  // ////////////////////

  const categoriesResults = path.resolve('./src/templates/categoriesResults.jsx');

  const getCategoriesResults = await graphql(`
  {
    wpgraphql {
      categories(first:100) {
        edges {
          node {
            id
            name
            slug
          }
          cursor
        }
        pageInfo {
          endCursor
          startCursor
          hasNextPage
          hasPreviousPage
        }
      }
    }
  }`);

  const categories = getCategoriesResults.data.wpgraphql.categories.edges;
  const categoriesPageInfo = getCategoriesResults.data.wpgraphql.categories.pageInfo;


  const allCategoriesArray = await fetchAllItems(categoriesPageInfo, categories, 'categories', 'id name slug');

  allCategoriesArray.map((cat) => {
    createPage({
      path: `category/${cat.node.slug}`,
      component: slash(categoriesResults),
      context: {
        id: cat.node.id,
      },
    });
  });

  // ////////////////////
  // Helper functions
  // ////////////////////

  async function fetchAllItems(initialCallPageInfo, initialCallData, itemName, queryFields) {
    let resultsArr = [];

    const recurssiveFetcher = async (pageInfo, edgesArray) => {
      resultsArr = [...resultsArr, ...edgesArray];
      if (pageInfo.hasNextPage) {
        const nextCall = await graphql(`
            {
              wpgraphql {
                ${itemName}(first: 100 after: "${pageInfo.endCursor}") {
                  edges {
                    node {
                      ${queryFields}
                    }
                    cursor
                  }
                  pageInfo {
                    endCursor
                    startCursor
                    hasNextPage
                    hasPreviousPage
                  }
                }
              }
            }`);

        const edgeArr = nextCall.data.wpgraphql[itemName].edges;
        const nextPageInfo = nextCall.data.wpgraphql[itemName].pageInfo;

        await recurssiveFetcher(nextPageInfo, edgeArr);
      }
    };

    await recurssiveFetcher(initialCallPageInfo, initialCallData);
    return resultsArr;
  }
};
