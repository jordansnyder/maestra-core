{
	"patcher" : 	{
		"fileversion" : 1,
		"appversion" : 		{
			"major" : 8,
			"minor" : 5,
			"revision" : 5,
			"architecture" : "x64",
			"modernui" : 1
		},
		"classnamespace" : "box",
		"rect" : [ 60.0, 104.0, 540.0, 420.0 ],
		"boxes" : [
			{
				"box" : 				{
					"id" : "obj-info",
					"maxclass" : "comment",
					"text" : "maestra.showphase  —  tracks show-control phase. Out: phase, previous phase, bang on active, bang on paused.",
					"numinlets" : 1,
					"numoutlets" : 0,
					"patching_rect" : [ 12.0, 8.0, 516.0, 20.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-1",
					"maxclass" : "newobj",
					"text" : "udpreceive 57121",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 12.0, 44.0, 120.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-2",
					"maxclass" : "newobj",
					"text" : "oscparse",
					"numinlets" : 1,
					"numoutlets" : 1,
					"outlettype" : [ "" ],
					"patching_rect" : [ 12.0, 80.0, 120.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-3",
					"maxclass" : "newobj",
					"text" : "route /maestra/entity/state",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"patching_rect" : [ 12.0, 116.0, 170.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-4",
					"maxclass" : "newobj",
					"text" : "route show_control",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"patching_rect" : [ 12.0, 152.0, 130.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-5",
					"maxclass" : "newobj",
					"text" : "js parse-show-phase.js",
					"numinlets" : 1,
					"numoutlets" : 2,
					"outlettype" : [ "", "" ],
					"patching_rect" : [ 12.0, 188.0, 150.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "obj-6",
					"maxclass" : "newobj",
					"text" : "sel active paused",
					"numinlets" : 1,
					"numoutlets" : 3,
					"outlettype" : [ "bang", "bang", "" ],
					"patching_rect" : [ 12.0, 224.0, 120.0, 22.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "out-1",
					"maxclass" : "outlet",
					"numinlets" : 1,
					"numoutlets" : 0,
					"comment" : "current phase",
					"patching_rect" : [ 12.0, 300.0, 30.0, 30.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "out-2",
					"maxclass" : "outlet",
					"numinlets" : 1,
					"numoutlets" : 0,
					"comment" : "previous phase",
					"patching_rect" : [ 60.0, 300.0, 30.0, 30.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "out-3",
					"maxclass" : "outlet",
					"numinlets" : 1,
					"numoutlets" : 0,
					"comment" : "bang: active",
					"patching_rect" : [ 108.0, 300.0, 30.0, 30.0 ]
				}
			},
			{
				"box" : 				{
					"id" : "out-4",
					"maxclass" : "outlet",
					"numinlets" : 1,
					"numoutlets" : 0,
					"comment" : "bang: paused",
					"patching_rect" : [ 156.0, 300.0, 30.0, 30.0 ]
				}
			}
		],
		"lines" : [
			{ "patchline" : { "source" : [ "obj-1", 0 ], "destination" : [ "obj-2", 0 ] } },
			{ "patchline" : { "source" : [ "obj-2", 0 ], "destination" : [ "obj-3", 0 ] } },
			{ "patchline" : { "source" : [ "obj-3", 0 ], "destination" : [ "obj-4", 0 ] } },
			{ "patchline" : { "source" : [ "obj-4", 0 ], "destination" : [ "obj-5", 0 ] } },
			{ "patchline" : { "source" : [ "obj-5", 0 ], "destination" : [ "obj-6", 0 ] } },
			{ "patchline" : { "source" : [ "obj-5", 0 ], "destination" : [ "out-1", 0 ] } },
			{ "patchline" : { "source" : [ "obj-5", 1 ], "destination" : [ "out-2", 0 ] } },
			{ "patchline" : { "source" : [ "obj-6", 0 ], "destination" : [ "out-3", 0 ] } },
			{ "patchline" : { "source" : [ "obj-6", 1 ], "destination" : [ "out-4", 0 ] } }
		]
	}
}
