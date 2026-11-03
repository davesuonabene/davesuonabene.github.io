---
layout: default
permalink: /blog/
title: blog
nav: true
nav_order: 2
pagination:
  enabled: true
  collection: posts
  permalink: /page/:num/
  per_page: 10
  sort_field: date
  sort_reverse: true
  trail:
    before: 1
    after: 3
---

<div class="post">

  <header class="post-header mb-4">
    <h1 class="post-title">blog</h1>
    <p class="post-description">thoughts, updates, guides, and releases</p>
  </header>

  {% if page.pagination.enabled %}
    {% assign postlist = paginator.posts %}
  {% else %}
    {% assign postlist = site.posts %}
  {% endif %}

  {% assign visible_posts = postlist | where_exp: "item", "item.hidden != true" %}

  {% if visible_posts.size == 0 %}
    <p class="text-muted py-4" style="font-family: var(--global-font-family-mono, monospace); font-size: 0.88rem;">
      [no posts yet &mdash; dEQ release coming soon]
    </p>
  {% else %}
    <ul class="post-list list-unstyled">
      {% for post in visible_posts %}
        {% if post.external_source == blank %}
          {% assign read_time = post.content | number_of_words | divided_by: 180 | plus: 1 %}
        {% else %}
          {% assign read_time = post.feed_content | strip_html | number_of_words | divided_by: 180 | plus: 1 %}
        {% endif %}
        {% assign year = post.date | date: "%Y" %}
        {% assign tags = post.tags | join: "" %}
        {% assign categories = post.categories | join: "" %}

        <li class="mb-4 pb-3 border-bottom">
          <div class="d-flex flex-wrap justify-content-between align-items-baseline mb-1">
            <h3 class="mb-0">
              {% if post.redirect == blank %}
                <a class="post-title" href="{{ post.url | relative_url }}">{{ post.title }}</a>
              {% elsif post.redirect contains '://' %}
                <a class="post-title" href="{{ post.redirect }}" target="_blank">{{ post.title }} &#8599;</a>
              {% else %}
                <a class="post-title" href="{{ post.redirect | relative_url }}">{{ post.title }}</a>
              {% endif %}
            </h3>
            <span class="text-muted" style="font-family: var(--global-font-family-mono, monospace); font-size: 0.78rem;">
              {{ post.date | date: '%Y.%m.%d' }} &middot; {{ read_time }} min read
            </span>
          </div>

          {% if post.description %}
            <p class="mb-2 text-muted" style="font-size: 0.95rem;">{{ post.description }}</p>
          {% endif %}

          {% if tags != "" or categories != "" %}
            <div class="post-tags" style="font-family: var(--global-font-family-mono, monospace); font-size: 0.75rem;">
              {% for category in post.categories %}
                <span class="mr-2 text-muted">[{{ category }}]</span>
              {% endfor %}
              {% for tag in post.tags %}
                <span class="mr-2 text-muted">#{{ tag }}</span>
              {% endfor %}
            </div>
          {% endif %}
        </li>
      {% endfor %}
    </ul>

    {% if page.pagination.enabled and paginator.total_pages > 1 %}
      {% include pagination.liquid %}
    {% endif %}
  {% endif %}

</div>
