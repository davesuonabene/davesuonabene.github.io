---
layout: default
permalink: /diary/
title: diary
nav: false
nav_order: 2
---

<div class="post">
  <header class="post-header">
    <h1 class="post-title"><i class="fa-solid fa-calendar-days fa-sm"></i> diary</h1>
    <p class="post-description">Daily updates of my work</p>
  </header>
  <article class="diary-archive">
    {% assign visible_posts = site.posts | where_exp: "item", "item.hidden != true" %}
    {% assign posts_by_year = visible_posts | group_by_exp: "post", "post.date | date: '%Y'" %}
    {% for year in posts_by_year %}
        <h2 class="year-title border-bottom pb-2 mb-3" style="color: var(--global-theme-color);">{{ year.name }}</h2>
        <div class="table-responsive">
          <table class="table table-sm table-borderless">
            <tbody>
              {% for post in year.items %}
                <tr>
                  <td class="date-col" style="width: 150px; color: var(--global-text-color-light);">
                    <strong>{{ post.date | date: "%B %d" }}</strong>
                  </td>
                  <td>
                    {% if post.redirect == blank %}
                      <a class="post-link" href="{{ post.url | relative_url }}">{{ post.title }}</a>
                    {% elsif post.redirect contains '://' %}
                      <a class="post-link" href="{{ post.redirect }}" target="_blank">{{ post.title }}</a>
                    {% else %}
                      <a class="post-link" href="{{ post.redirect | relative_url }}">{{ post.title }}</a>
                    {% endif %}
                  </td>
                </tr>
              {% endfor %}
            </tbody>
          </table>
        </div>
      </div>
    {% endfor %}
  </article>
</div>
